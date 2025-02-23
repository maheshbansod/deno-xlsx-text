import { readBytesAsNumber, readBytesAsString } from "./data.ts";

export class ZipReader {
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
    const cdRecordsCount = readBytesAsNumber(
      buffer,
      eocdSignatureIndex + 10,
      2,
    );
    const cdSize = readBytesAsNumber(buffer, eocdSignatureIndex + 12, 4);
    const cdOffset = readBytesAsNumber(buffer, eocdSignatureIndex + 16, 4);

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
      const extraFieldLen = readBytesAsNumber(buffer, startOffset + 30, 2);
      const fileCommentLen = readBytesAsNumber(buffer, startOffset + 32, 2);
      const localFileHeaderOffset = readBytesAsNumber(
        buffer,
        startOffset + 42,
        4,
      );
      const fileName = readBytesAsString(buffer, startOffset + 46, fileNameLen);
      return {
        data: {
          fileName,
          localFileHeaderOffset,
        },
        nextOffset: startOffset + 46 + fileNameLen + extraFieldLen +
          fileCommentLen,
      };
    };
    let offset = 0;
    const data = [];
    for (let i = 0; i < this.cdRecordsCount; i++) {
      const r = readCDFileHeader(offset);
      offset = r.nextOffset;
      data.push(
        new LocalFileHeaderMetaInfo(
          r.data.fileName,
          r.data.localFileHeaderOffset,
        ),
      );
    }
    return data;
  }
  async readFile(lfhInfo: LocalFileHeaderMetaInfo) {
    await this.file.seek(lfhInfo.offset, Deno.SeekMode.Start);
    const staticLfhSize = 30;
    const buffer = new Uint8Array(staticLfhSize);
    // TODO: maybe error handling idk
    await this.file.read(buffer);

    const compressionMethod = readBytesAsNumber(buffer, 8, 2);
    const fileNameLen = readBytesAsNumber(buffer, 26, 2);
    const extraFieldLen = readBytesAsNumber(buffer, 28, 2);
    const fileDataStartOffset = staticLfhSize + fileNameLen + extraFieldLen;
    await this.file.seek(
      lfhInfo.offset + fileDataStartOffset,
      Deno.SeekMode.Start,
    );
    const endOfFileSignature = [0x50, 0x4b, 0x07, 0x08];
    const bf = new Uint8Array(4);
    const rest: number[] = [];
    let matchedOffset = -1;
    while (true) {
      const bytesRead = await this.file.read(bf);
      if (!bytesRead) {
        break;
      }
      for (let i = 0; i < bf.length; i++) {
        rest.push(bf[i]);
      }
      for (let i = rest.length - bytesRead - 3; i < rest.length; i++) {
        let match = true;
        for (let j = 0; j < endOfFileSignature.length; j++) {
          if (rest[i + j] !== endOfFileSignature[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          matchedOffset = i;
          break;
        }
      }
      if (matchedOffset !== -1) {
        break;
      }
    }
    if (matchedOffset === -1) {
      matchedOffset = 0;
      throw new Error("erronisity");
    }

    await this.file.seek(
      lfhInfo.offset + fileDataStartOffset,
      Deno.SeekMode.Start,
    );

    const fileDataBuffer = new Uint8Array(matchedOffset);
    await this.file.read(fileDataBuffer);

    return { data: fileDataBuffer, isCompressed: compressionMethod === 8 };
  }
}
class LocalFileHeaderMetaInfo {
  constructor(
    public readonly filename: string,
    public readonly offset: number,
  ) {}
}
