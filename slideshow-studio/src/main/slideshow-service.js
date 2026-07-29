const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { runSlideshow } = require("./render");

let activeJob = null;

function hasActiveJob() {
  return activeJob !== null;
}

function createError(message) {
  return new Error(message);
}

function getResourceRoot(projectRoot) {
  if (app.isPackaged) {
    return process.resourcesPath;
  }

  return projectRoot;
}

function getFfmpegPath(projectRoot) {
  const resourceRoot = getResourceRoot(projectRoot);
  const candidates = [
    process.env.SLIDESHOW_FFMPEG_PATH,
    path.join(resourceRoot, "ffmpeg", "ffmpeg.exe"),
    path.join(resourceRoot, "ffmpeg-8.1-essentials_build", "bin", "ffmpeg.exe"),
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw createError("ffmpeg was not found.");
}

function startSlideshowJob(payload, hooks) {
  if (activeJob) {
    throw createError("A slideshow job is already running.");
  }

  const ffmpegPath = getFfmpegPath(hooks.projectRoot);
  const job = { cancelled: false, currentProc: null };
  activeJob = job;

  return runSlideshow(payload, {
    ffmpegPath,
    projectRoot: getResourceRoot(hooks.projectRoot),
    hooks,
    job
  })
    .then((result) => {
      activeJob = null;
      return result;
    })
    .catch((error) => {
      activeJob = null;
      if (!job.cancelled) {
        hooks.sendError({ type: "error", message: error.message, cancelled: false });
      }
      throw error;
    });
}

function cancelSlideshowJob() {
  if (!activeJob) {
    return;
  }

  activeJob.cancelled = true;
  if (activeJob.currentProc && !activeJob.currentProc.killed) {
    activeJob.currentProc.kill();
  }
}

module.exports = {
  cancelSlideshowJob,
  hasActiveJob,
  startSlideshowJob
};
