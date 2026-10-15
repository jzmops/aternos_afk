/**
 * A small ZIP writer, used only by scripts/build-portable.js.
 *
 * Why not shell out to `zip`, `tar -a` or PowerShell's Compress-Archive?
 * Because each of those exists on only some platforms: GNU tar refuses to
 * create a zip at all, Compress-Archive only exists on Windows, and the `zip`
 * command is not on a Windows machine. The release package has to come out the
 * same whether it was built by the GitHub runner or by hand on a laptop, so the
 * archive is written here instead. Deflate and CRC-32 both come from Node's own
 * zlib, which is why this file needs no dependencies.
 *
 * Only the plain (non-ZIP64) format is written: entry names are UTF-8, the
 * archive must hold fewer than 65535 entries and stay under 4 GB. zipDirectory
 * refuses with a clear message if either limit would be crossed, rather than
 * quietly writing a file Windows cannot open.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const VERSION_NEEDED = 20; // 2.0 — the format's baseline, understood everywhere
const VERSION_MADE_BY = 0x031e; // 3.0, MS-DOS host value 0 (unix) in the high byte

const MODE_FILE = 0x81a4; // 0644 with the regular-file bit
const MODE_DIR = 0x41ed; // 0755 with the directory bit

const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

/** MS-DOS date and time, the only timestamps the plain ZIP format holds. */
function dosStamp(date) {
  const year = date.getFullYear();
  if (year < 1980) return { time: 0, date: 1 << 5 | 1 };
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day = ((Math.min(year, 2107) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

/**
 * Every file and folder below dir, with forward-slash names relative to it.
 * Symlinks are followed and stored as ordinary files, which is what a Windows
 * checkout of node_modules contains anyway (npm writes .cmd shims there).
 */
function collect(dir, prefix, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? prefix + "/" + entry.name : entry.name;

    let isDirectory = entry.isDirectory();
    if (!isDirectory && entry.isSymbolicLink()) {
      let target;
      try {
        target = fs.statSync(full);
      } catch (err) {
        throw new Error("broken symlink in the package: " + rel);
      }
      isDirectory = target.isDirectory();
    }

    if (isDirectory) {
      out.push({ full, name: rel + "/", directory: true });
      collect(full, rel, out);
    } else {
      out.push({ full, name: rel, directory: false });
    }
  }

  return out;
}

function fileCountIn(dir) {
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) total += fileCountIn(path.join(dir, entry.name));
    else total += 1;
  }
  return total;
}

/**
 * Write srcDir into destZip. The folder keeps its own name inside the archive,
 * so extracting always produces one tidy AFK-Bot folder instead of scattering
 * ten thousand files into wherever the user happened to be.
 * Returns the number of entries written and the number of source bytes read.
 */
function zipDirectory(srcDir, destZip, options) {
  const level = (options && options.level) !== undefined ? options.level : 6;
  const top = path.basename(path.resolve(srcDir));

  const entries = [];
  collect(srcDir, top, entries);

  if (entries.length > MAX_ENTRIES) {
    throw new Error(
      "the package holds " +
        entries.length +
        " files and folders, and a plain ZIP tops out at " +
        MAX_ENTRIES +
        " - split the package or compress its data files"
    );
  }

  fs.mkdirSync(path.dirname(destZip), { recursive: true });
  const fd = fs.openSync(destZip, "w");

  let offset = 0;
  let sourceBytes = 0;
  const central = [];

  const write = (buffer) => {
    fs.writeSync(fd, buffer, 0, buffer.length);
    offset += buffer.length;
  };

  try {
    for (const entry of entries) {
      const stat = fs.statSync(entry.full);
      const stamp = dosStamp(stat.mtime);
      const nameBuffer = Buffer.from(entry.name, "utf8");

      let method = METHOD_STORE;
      let crc = 0;
      let packed = Buffer.alloc(0);
      let unpackedSize = 0;
      let uncompressed;

      if (entry.directory) {
        uncompressed = Buffer.alloc(0);
      } else {
        uncompressed = fs.readFileSync(entry.full);
        unpackedSize = uncompressed.length;
        sourceBytes += unpackedSize;
        crc = zlib.crc32(uncompressed);
        if (unpackedSize > 0) {
          packed = zlib.deflateRawSync(uncompressed, { level });
          // Deflate can grow already-compressed data; store it plainly then.
          if (packed.length >= unpackedSize) {
            packed = uncompressed;
          } else {
            method = METHOD_DEFLATE;
          }
        }
      }

      if (packed.length > MAX_SIZE || unpackedSize > MAX_SIZE || offset > MAX_SIZE) {
        throw new Error(
          "the package is larger than the plain ZIP format allows (4 GB) - build a ZIP64 archive instead"
        );
      }

      const local = Buffer.alloc(30);
      local.writeUInt32LE(SIG_LOCAL, 0);
      local.writeUInt16LE(VERSION_NEEDED, 4);
      local.writeUInt16LE(FLAG_UTF8, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(stamp.time, 10);
      local.writeUInt16LE(stamp.date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(packed.length, 18);
      local.writeUInt32LE(unpackedSize, 22);
      local.writeUInt16LE(nameBuffer.length, 26);
      local.writeUInt16LE(0, 28);

      const localOffset = offset;
      write(local);
      write(nameBuffer);
      if (!entry.directory) write(packed);

      const header = Buffer.alloc(46);
      header.writeUInt32LE(SIG_CENTRAL, 0);
      header.writeUInt16LE(VERSION_MADE_BY, 4);
      header.writeUInt16LE(VERSION_NEEDED, 6);
      header.writeUInt16LE(FLAG_UTF8, 8);
      header.writeUInt16LE(method, 10);
      header.writeUInt16LE(stamp.time, 12);
      header.writeUInt16LE(stamp.date, 14);
      header.writeUInt32LE(crc, 16);
      header.writeUInt32LE(packed.length, 20);
      header.writeUInt32LE(unpackedSize, 24);
      header.writeUInt16LE(nameBuffer.length, 28);
      header.writeUInt16LE(0, 30); // extra field length
      header.writeUInt16LE(0, 32); // comment length
      header.writeUInt16LE(0, 34); // disk number
      header.writeUInt16LE(0, 36); // internal attributes
      // >>> 0 because shifting a unix mode into the top half of the word goes
      // negative in JavaScript's signed <<, and writeUInt32LE rejects that.
      header.writeUInt32LE(
        (((entry.directory ? MODE_DIR : MODE_FILE) << 16) | (entry.directory ? 0x10 : 0)) >>> 0,
        38
      );
      header.writeUInt32LE(localOffset, 42);

      central.push(Buffer.concat([header, nameBuffer]));
    }

    const centralOffset = offset;
    for (const record of central) write(record);
    const centralSize = offset - centralOffset;

    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_END, 0);
    end.writeUInt16LE(0, 4); // this disk
    end.writeUInt16LE(0, 6); // disk with the central directory
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralOffset, 16);
    end.writeUInt16LE(0, 20); // comment length
    write(end);
  } finally {
    fs.closeSync(fd);
  }

  return { entries: entries.length, sourceBytes, archiveBytes: offset };
}

module.exports = { zipDirectory, collect, fileCountIn };
