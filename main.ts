class ZipReader {
  private constructor(
    private file: Deno.FsFile,
    private cdOffset: number,
    private cdSize: number,
    private cdRecordsCount: number,
  ) {
  }
  static async new(filename: string) {
    const file = await Deno.open(filename, { read: true });
    const fileSize = (await Deno.stat(filename)).size;
    const maxEOCDSize = 65557;
    const searchBufferSize = Math.min(fileSize, maxEOCDSize);
    const eocdSignature = [0x50, 0x4b, 0x05, 0x06];
    const seekPos = fileSize - searchBufferSize;
    await file.seek(seekPos < 0 ? 0 : seekPos, Deno.SeekMode.Start);

    const buffer = new Uint8Array(searchBufferSize);
    const bytesRead = await file.read(buffer);

    if (bytesRead === null) {
      throw new Error("Failed to read file.");
    }

    let eocdSignatureIndex = -1;
    for (let i = bytesRead - eocdSignature.length; i >= 0; i--) {
      let match = true;
      for (let j = 0; j < eocdSignature.length; j++) {
        if (buffer[i + j] !== eocdSignature[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        eocdSignatureIndex = seekPos + i;
        break;
      }
    }

    if (eocdSignatureIndex === -1) {
      throw new Error(`Couldn't find the EOCD`);
    }
    const diskNumber = readBytesAsNumber(buffer, eocdSignatureIndex + 4, 2);
    console.log({ diskNumber });
    const cdRecordsCount = readBytesAsNumber(
      buffer,
      eocdSignatureIndex + 10,
      2,
    );
    console.log({ cdRecordsCount });
    const cdSize = readBytesAsNumber(buffer, eocdSignatureIndex + 12, 4);
    const cdOffset = readBytesAsNumber(buffer, eocdSignatureIndex + 16, 4);
    console.log({ cdSize, cdOffset });

    return new ZipReader(file, cdOffset, cdSize, cdRecordsCount);
  }
  async listFiles() {
    this.file.seek(this.cdOffset, Deno.SeekMode.Start);
    const buffer = new Uint8Array(this.cdSize);
    const bytesRead = await this.file.read(buffer);
    if (bytesRead === 0) {
      throw new Error("Unable to read bytes from " + this.cdOffset);
    }
    if (bytesRead !== this.cdSize) {
      throw new Error(
        `Read only ${bytesRead}. Central directory size is ${this.cdSize}`,
      );
    }
    const readCDFileHeader = (startOffset: number) => {
      const fileNameLen = readBytesAsNumber(buffer, startOffset + 28, 2);
      console.log({ fileNameLen });
      const extraFieldLen = readBytesAsNumber(buffer, startOffset + 30, 2);
      const fileCommentLen = readBytesAsNumber(buffer, startOffset + 32, 2);
      const fileName = readBytesAsString(buffer, startOffset + 46, fileNameLen);
      console.log({ fileName });
      return {
        data: {
          fileName,
        },
        nextOffset: startOffset + 46 + fileNameLen + extraFieldLen +
          fileCommentLen,
      };
    };
    let offset = 0;
    const fileNames = [];
    for (let i = 0; i < this.cdRecordsCount; i++) {
      const r = readCDFileHeader(offset);
      offset = r.nextOffset;
      fileNames.push(r.data.fileName);
    }
    return fileNames;
  }
}

/**
 * Lil endian gang reading of some bytes
 */
function readBytesAsNumber(buffer: Uint8Array, offset: number, n: number) {
  let value = 0;
  for (let i = 0; i < n; i++) {
    const idx = offset + i;
    value += buffer[idx] * Math.pow(256, i);
  }
  return value;
}

function readBytesAsString(buffer: Uint8Array, offset: number, n: number) {
  return new TextDecoder().decode(buffer.subarray(offset, offset + n));
}

if (import.meta.main) {
  // const filename = "stuff.zip";
  const filename = "sample.xlsx";
  const zipReader = await ZipReader.new(filename);
  const files = await zipReader.listFiles();
  console.log({ files });
}
