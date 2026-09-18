const { getDb } = require('./db');

let running = false;

function startWorker() {
  console.log('Background worker started');
  setInterval(processPendingJobs, 2000);
  processPendingJobs();
}

async function processPendingJobs() {
  if (running) return;
  running = true;

  try {
    const db = getDb();
    const job = db.jobs.find((j) => j.status === 'pending');

    if (!job) {
      running = false;
      return;
    }

    job.status = 'processing';
    job.started_at = new Date().toISOString();
    db.persist();

    console.log(`Processing job ${job.id} (${job.original_filename})`);

    const rows = db.import_rows
      .filter((r) => r.job_id === job.id && r.status === 'pending')
      .sort((a, b) => a.row_index - b.row_index);

    let processed = 0;
    for (const row of rows) {
      try {
        await processRow(row);
        row.status = 'completed';
        processed++;
      } catch (err) {
        row.status = 'failed';
        row.error_message = err.message;
        processed++;
      }

      job.processed_count = processed;
      db.persist();
    }

    const failedCount = db.import_rows.filter((r) => r.job_id === job.id && r.status === 'failed').length;

    if (failedCount > 0) {
      job.status = 'completed_with_errors';
    } else {
      job.status = 'completed';
    }
    job.completed_at = new Date().toISOString();
    db.persist();

    console.log(`Job ${job.id} completed: ${processed} rows processed, ${failedCount} errors`);
  } catch (err) {
    console.error('Worker error:', err);
  } finally {
    running = false;
  }
}

async function processRow(row) {
  const data = row.raw_data;
  const columns = data.split(',');

  if (columns.length < 2) {
    throw new Error('Row must have at least 2 comma-separated columns');
  }

  const name = columns[0].trim();
  const email = columns[1].trim();

  if (!email.includes('@')) {
    throw new Error(`Invalid email format: ${email}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  return { name, email, processed: true };
}

module.exports = { startWorker, processPendingJobs };
