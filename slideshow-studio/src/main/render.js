const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

function createError(message) {
  return new Error(message);
}

function buildSingleImageFilter(bgColor, blurAmount, distanceAmount, opacityPercent) {
  const shadowX = Math.max(0, Math.round(distanceAmount * 2.2));
  const shadowY = Math.max(0, Math.round(distanceAmount * 2.8));
  const alpha = Math.max(0, Math.min(1, opacityPercent / 100));
  const blur = Math.max(0, Math.trunc(blurAmount));
  const shadowPad = Math.max(Math.max(1, blur) * 3, Math.max(shadowX, shadowY) * 3);

  if (blur <= 0) {
    return (
      `color=c=${bgColor}:s=1080x1920[bg];` +
      "[0:v]scale=1000:1840:force_original_aspect_ratio=decrease," +
      "format=rgba,pad=1000:1840:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1," +
      "split=2[img_main][shadow_src];" +
      "[shadow_src]colorchannelmixer=" +
      "rr=0:rg=0:rb=0:ra=0:" +
      "gr=0:gg=0:gb=0:ga=0:" +
      "br=0:bg=0:bb=0:ba=0:" +
      `ar=0:ag=0:ab=0:aa=${alpha}[shadow];` +
      `[bg][shadow]overlay=(W-w)/2+${shadowX}:(H-h)/2+${shadowY}:format=auto[bg_shadow];` +
      "[bg_shadow][img_main]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgb24[v]"
    );
  }

  return (
    `color=c=${bgColor}:s=1080x1920[bg];` +
    "[0:v]scale=1000:1840:force_original_aspect_ratio=decrease," +
    "pad=1000:1840:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1," +
    "format=rgba,split=2[img_main][shadow_src];" +
    `[img_main]pad=iw+${shadowPad * 2}:ih+${shadowPad * 2}:${shadowPad}:${shadowPad}:color=black@0[img_canvas];` +
    `[shadow_src]pad=iw+${shadowPad * 2}:ih+${shadowPad * 2}:${shadowPad}:${shadowPad}:color=black@0,` +
    "colorchannelmixer=" +
    "rr=0:rg=0:rb=0:ra=0:" +
    "gr=0:gg=0:gb=0:ga=0:" +
    "br=0:bg=0:bb=0:ba=0:" +
    `ar=0:ag=0:ab=0:aa=${alpha},` +
    `boxblur=luma_radius=${blur}:luma_power=1:chroma_radius=${Math.max(1, Math.floor(blur / 2))}:` +
    `chroma_power=1:alpha_radius=${blur}:alpha_power=1[shadow];` +
    `[bg][shadow]overlay=(W-w)/2+${shadowX}:(H-h)/2+${shadowY}:format=auto[bg_shadow];` +
    "[bg_shadow][img_canvas]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgb24[v]"
  );
}

function collectImages(folder) {
  const exts = [".jpg", ".jpeg", ".png"];
  const found = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (exts.includes(path.extname(entry.name).toLowerCase())) {
        let mtime = 0;
        try {
          mtime = fs.statSync(fullPath).mtimeMs;
        } catch (_error) {
          mtime = 0;
        }
        found.push({ fullPath, mtime });
      }
    }
  };

  walk(folder);
  found.sort((a, b) => a.mtime - b.mtime);
  return found.map((item) => item.fullPath);
}

// Run ffmpeg once. Resolves with { code, stderr }; never rejects.
// onStderr (optional) receives each completed stderr line for live progress parsing.
function runFfmpeg(ffmpegPath, args, { job, onStderr } = {}) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });

    if (job) {
      job.currentProc = proc;
    }

    let stderr = "";
    let buffer = "";

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (onStderr) {
        buffer += text;
        let breakIndex = buffer.search(/[\r\n]/);
        while (breakIndex >= 0) {
          const line = buffer.slice(0, breakIndex);
          buffer = buffer.slice(breakIndex + 1);
          if (line) {
            onStderr(line);
          }
          breakIndex = buffer.search(/[\r\n]/);
        }
      }
    });

    proc.on("error", (error) => {
      if (job) {
        job.currentProc = null;
      }
      resolve({ code: -1, stderr: `${stderr}\n${error.message}` });
    });

    proc.on("close", (code) => {
      if (job) {
        job.currentProc = null;
      }
      resolve({ code: code == null ? -1 : code, stderr });
    });
  });
}

// Port of slideshow_backend.py run_ffmpeg_render. hooks: { sendProgress, sendDone }.
// job: { cancelled, currentProc } shared with the service for cancellation.
async function runSlideshow(payload, { ffmpegPath, projectRoot, hooks, job }) {
  const folder = String(payload.folder || "");
  const duration = Number(payload.duration);
  const bgColor = String(payload.bgColor || "");
  const useShadow = Boolean(payload.useShadow);
  const rawOpacity = Number(payload.shadowOpacity ?? 35);
  const blurAmount = useShadow ? Number(payload.blurAmount ?? 5) : 0;
  const distanceAmount = useShadow ? Number(payload.distanceAmount ?? 6) : 0;
  const shadowOpacity = useShadow ? rawOpacity : 0;

  if (!folder) {
    throw createError("Photo folder is required.");
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw createError("Selected photo folder does not exist.");
  }
  if (!(duration > 0)) {
    throw createError("Duration must be greater than 0.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(bgColor)) {
    throw createError("Background color must use #RRGGBB format.");
  }
  if (!(rawOpacity >= 0 && rawOpacity <= 100)) {
    throw createError("Shadow opacity must be between 0 and 100.");
  }

  const imagePaths = collectImages(folder);
  if (imagePaths.length === 0) {
    throw createError("No image files were found in the selected folder.");
  }

  const folderName = path.basename(folder.replace(/[/\\]+$/, ""));
  const outputPath = path.join(folder, `${folderName}_slideshow.mp4`);
  const tempDir = fs.mkdtempSync(path.join(folder, "slideshow_frames_"));
  const listPath = path.join(folder, `_filelist_${crypto.randomBytes(16).toString("hex")}.txt`);
  const logPath = path.join(projectRoot, "ffmpeg_log.txt");
  const totalFrames = Math.max(1, Math.floor(imagePaths.length * duration * 24));

  const imageFilter = buildSingleImageFilter(bgColor, blurAmount, distanceAmount, shadowOpacity);

  hooks.sendProgress({ type: "progress", phase: "prepare", percent: 0, message: "Preparing images... (0%)" });

  try {
    const renderedPaths = [];
    for (let index = 1; index <= imagePaths.length; index += 1) {
      if (job.cancelled) {
        throw createError("The job was cancelled.");
      }

      const imagePath = imagePaths[index - 1];
      const renderedPath = path.join(tempDir, `frame_${String(index).padStart(5, "0")}.png`);
      const { code, stderr } = await runFfmpeg(ffmpegPath, [
        "-y",
        "-i",
        imagePath,
        "-filter_complex",
        imageFilter,
        "-map",
        "[v]",
        "-frames:v",
        "1",
        renderedPath
      ], { job });

      if (job.cancelled) {
        throw createError("The job was cancelled.");
      }
      if (code !== 0) {
        throw createError(`Failed to preprocess image:\n${imagePath}\n\n${stderr.trim()}`);
      }

      renderedPaths.push(renderedPath);
      const prepPct = Math.floor((index / imagePaths.length) * 35);
      hooks.sendProgress({ type: "progress", phase: "prepare", percent: prepPct, message: `Preparing images... (${prepPct}%)` });
    }

    const listLines = [];
    for (const renderedPath of renderedPaths) {
      listLines.push(`file '${renderedPath.replace(/\\/g, "/")}'`);
      listLines.push(`duration ${duration}`);
    }
    listLines.push(`file '${renderedPaths[renderedPaths.length - 1].replace(/\\/g, "/")}'`);
    fs.writeFileSync(listPath, `${listLines.join("\n")}\n`, "utf8");

    if (job.cancelled) {
      throw createError("The job was cancelled.");
    }

    const cmd = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-filter_threads",
      "1",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "stillimage",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "fps=24,setsar=1",
      "-r",
      "24",
      "-progress",
      "pipe:2",
      outputPath
    ];

    hooks.sendProgress({ type: "progress", phase: "render", percent: 35, message: "Creating video... (35%)" });

    const { code, stderr } = await runFfmpeg(ffmpegPath, cmd, {
      job,
      onStderr: (line) => {
        const match = /frame=\s*(\d+)/.exec(line);
        if (match) {
          const frame = parseInt(match[1], 10);
          const pct = Math.min(35 + Math.floor((frame / totalFrames) * 64), 99);
          hooks.sendProgress({ type: "progress", phase: "render", percent: pct, message: `Creating video... (${pct}%)` });
        }
      }
    });

    const header =
      `CMD: ${ffmpegPath} ${cmd.join(" ")}\n\n` +
      `IMAGES (${imagePaths.length}):\n` +
      `${imagePaths.map((p) => `  ${p}`).join("\n")}\n\n` +
      "FFMPEG OUTPUT:\n";
    try {
      fs.writeFileSync(logPath, header + stderr, "utf8");
    } catch (_error) {
      // logging is best-effort
    }

    if (code !== 0) {
      if (job.cancelled) {
        throw createError("The job was cancelled.");
      }
      const detail = stderr.trim().split(/\r?\n/).slice(-20).join("\n").trim();
      throw createError(detail || "Failed to create the video.");
    }

    hooks.sendDone({ type: "done", outputPath, logPath });
    return { outputPath, logPath };
  } finally {
    try {
      if (fs.existsSync(listPath)) {
        fs.unlinkSync(listPath);
      }
    } catch (_error) {
      // ignore
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // ignore
    }
  }
}

module.exports = {
  runSlideshow,
  buildSingleImageFilter,
  collectImages
};
