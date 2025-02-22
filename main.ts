import { xlsxToCsv } from "./xlsx.ts";
export { xlsxToCsv };

if (import.meta.main) {
  const filename = "test/sample.xlsx";
  const csvData = await xlsxToCsv(filename);
  console.log(csvData);
}
