import { inflateRaw } from "node:zlib";
import { ZipReader } from "./utils/zip.ts";
import { XMLParser } from "fast-xml-parser";

enum CellDataType {
  Date,
  Duration,
  Value,
}
const StyleIdsMap = {
  164: CellDataType.Date,
  14: CellDataType.Date,
  46: CellDataType.Duration,
  0: CellDataType.Value,
} as const satisfies Record<number, CellDataType>;

type XlsxParsingOptions = {
  debug?: boolean;
  filterSheets?: (sheet: ParsedSheet) => boolean;
};

/**
 * Read an XLSX file and return the sheets' contents.
 */
export async function readXlsx(
  filename: string,
  options?: XlsxParsingOptions,
) {
  options = options || {};
  options.debug = options?.debug || false;
  options.filterSheets = options?.filterSheets || (() => true);
  const { debug } = options;
  const { filterSheets } = options;
  const zipReader = await ZipReader.new(filename);
  const files = await zipReader.listFiles();
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
  const data = await Promise.all(compressedData.map((cd) => {
    return new Promise<{ filename: string; result: string }>((resolve) => {
      inflateRaw(cd.data, (error, result) => {
        if (error) {
          console.error(error);
          throw new Error("error occored");
        }
        resolve({
          filename: cd.filename,
          result: new TextDecoder().decode(result),
        });
      });
    });
  }));
  if (debug) {
    const fileNames = data.map((d) => d.filename).join(",");
    console.log("Files found in archive: " + fileNames);
  }
  const workbook = data.find((d) => d.filename.endsWith("/workbook.xml"));
  if (!workbook) {
    throw new Error("No workbook.xml found!");
  }
  const xmlParser = new XMLParser({ ignoreAttributes: false });
  const parsedWorkBookXml: ParsedWorkBook = xmlParser.parse(workbook.result);
  const sheets = xmlObjAsList(parsedWorkBookXml.workbook.sheets.sheet);
  if (debug) {
    console.log({ sheets });
  }
  const sharedStringsFile = data.find((d) =>
    d.filename === "xl/sharedStrings.xml"
  );
  if (!sharedStringsFile) {
    throw new Error("COuldn't find sharedString file");
  }
  const parsedSharedStrings: ParsedSharedStrings = xmlParser.parse(
    sharedStringsFile.result,
  );
  const sharedStrings = parsedSharedStrings.sst.si.map((s) =>
    typeof s.t === "string" ? s.t : s.t["#text"]
  );
  const stylesFile = data.find((d) => d.filename === "xl/styles.xml");
  if (!stylesFile) {
    throw new Error("Couldn't find styles");
  }
  const parsedStyles: ParsedStyles = xmlParser.parse(stylesFile.result);
  const styles = parsedStyles.styleSheet.cellXfs.xf.map((x) =>
    StyleIdsMap[Number(x["@_numFmtId"]) as keyof typeof StyleIdsMap]
  );
  const csvSheets = [];
  for (const sheet of sheets.filter(filterSheets)) {
    const id = sheet["@_sheetId"];
    const fileName = `xl/worksheets/sheet${id}.xml`;
    const sheetFile = data.find((d) => d.filename.endsWith(fileName));
    if (!sheetFile) {
      throw new Error(fileName + " sheet not found!");
    }
    const parsedSheet1 = xmlParser.parse(sheetFile.result);
    const rows: ParsedRow[] = parsedSheet1.worksheet.sheetData.row;
    const csvRows = [];
    for (const row of rows) {
      const cols = xmlObjAsList(row.c);
      csvRows.push(
        cols.map((c) => {
          if (c.v) {
            if (c["@_t"] === "s") {
              return sharedStrings[Number(c.v)];
            } else if (c["@_s"]) {
              const styleIdx = Number(c["@_s"]);
              if (styles[styleIdx] === CellDataType.Date) {
                return excelDateToJSDate(Number(c.v)).toLocaleDateString(
                  "en-GB",
                );
              } else if (styles[styleIdx] === CellDataType.Duration) {
                return durationFmt(excelDurationToJS(Number(c.v)));
              } else {
                return c.v.toString();
              }
            } else {
              return c.v.toString();
            }
          }
          return "";
        }).map((s) => {
          return s.includes(",") ? `"${s.replace(/"/g, '\\"')}"` : s;
        }).join(
          ",",
        ),
      );
    }
    const csvData = csvRows.join("\n").trim();
    csvSheets.push({ sheet: { name: sheet["@_name"] }, data: csvData });
  }
  return csvSheets;
}

type ParsedRow = {
  c: ParsedCol | ParsedCol[];
};

type ParsedCol = {
  "@_r": string;
  "@_s": string;
  "@_t"?: string;
  v?: string;
};

type ParsedWorkBook = {
  workbook: {
    sheets: {
      sheet: ParsedSheet | ParsedSheet[];
    };
  };
};

type ParsedSheet = {
  "@_state": "visible";
  "@_name": string;
  "@_sheetId": string;
  "@_r:id": string;
};

type ParsedSharedStrings = {
  sst: {
    si: {
      t: string | {
        "#text": string;
      };
    }[];
  };
};

type ParsedStyles = {
  styleSheet: {
    cellXfs: {
      xf: {
        "@_numFmtId": `${number}`;
      }[];
    };
  };
};

function xmlObjAsList<T>(x: T | T[]) {
  if (x && typeof x === "object" && "length" in x) {
    return x;
  }
  return [x];
}
function excelDateToJSDate(serial: number): Date {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30
  const msPerDay = 86400000; // 24 * 60 * 60 * 1000
  return new Date(excelEpoch.getTime() + serial * msPerDay);
}
function excelDurationToJS(duration: number) {
  const totalSeconds = Math.round(duration * 86400); // Convert days to seconds
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}
function durationFmt(duration: Duration) {
  let val = "";
  if (duration.days !== 0) {
    val += duration.days + "d";
  }
  if (duration.hours !== 0) {
    val += `${duration.hours}h`;
  }
  if (duration.minutes !== 0) {
    val += `${duration.minutes}m`;
  }
  if (duration.seconds !== 0) {
    val += `${duration.seconds}s`;
  }
  return val;
}
type Duration = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};
