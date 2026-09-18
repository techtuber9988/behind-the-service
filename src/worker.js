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
    const pendingJobs = db.get('jobs').filter({ status: 'pending' }).value();

    if (!pendingJobs || pendingJobs.length === 0) {
      running = false;
      return;
    }

    const job = pendingJobs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];

    db.get('jobs').find({ id: job.id }).assign({
      status: 'processing',
      started_at: new Date().toISOString(),
    }).write();

    console.log(`Processing job ${job.id} (${job.original_filename})`);

    const pendingRows = db.get('import_rows').filter({ job_id: job.id, status: 'pending' }).value();
    const rows = pendingRows.sort((a, b) => a.row_index - b.row_index);

    let processed = 0;
    for (const row of rows) {
      try {
        await processRow(row);
        db.get('import_rows').find({ id: row.id }).assign({ status: 'completed' }).write();
        processed++;
      } catch (err) {
        db.get('import_rows').find({ id: row.id }).assign({
          status: 'failed',
          error_message: err.message,
        }).write();
        processed++;
      }

      db.get('jobs').find({ id: job.id }).assign({ processed_count: processed }).write();
    }

    const failedCount = db.get('import_rows').filter({ job_id: job.id, status: 'failed' }).value().length;

    if (failedCount > 0) {
      db.get('jobs').find({ id: job.id }).assign({
        status: 'completed_with_errors',
        completed_at: new Date().toISOString(),
      }).write();
    } else {
      db.get('jobs').find({ id: job.id }).assign({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).write();
    }

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
