import { readXlsx } from "./xlsx.ts";
export { readXlsx };

if (import.meta.main) {
  const filename = "test/sample.xlsx";
  const csvData = await readXlsx(filename);
  console.log(csvData);
}
