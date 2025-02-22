import { ZipReader } from "./utils/zip.ts";
import { inflateRaw } from "node:zlib";

if (import.meta.main) {
  // TODO: maybe make it a CLI too?
  // const filename = "stuff.zip";
  const filename = "test/sample.xlsx";
  const zipReader = await ZipReader.new(filename);
  const files = await zipReader.listFiles();
  console.log(files.length + " files found in archive");
  console.log("reading files");
  const compressedData: {
    filename: string;
    isCompressed: boolean;
    data: Uint8Array;
  }[] = [];

  for (let i = 0; i < files.length; i++) {
    compressedData.push({
      ...await zipReader.readFile(files[i]),
      filename: files[i].filename,
    });
  }
  compressedData.map((cd) => {
    inflateRaw(cd.data, (error, result) => {
      if (error) {
        console.error(error);
        throw new Error("error occored");
      }
      console.log("file", result, cd.filename);
      console.log(new TextDecoder().decode(result));
    });
  });
}
