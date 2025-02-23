# deno-xlsx-text

Convert XLSX file to a textual format like CSV.

### Installation

#### Deno

```sh
deno add jsr:@maheshbansod/xlsx
```

### Node/NPM

```sh
npx jsr add @maheshbansod/xlsx
```

See [jsr.io](https://jsr.io/@maheshbansod/xlsx) page for more.

### Usage

```typescript
import * as xlsx from "@maheshbansod/xlsx";

const filename = "test/sample.xlsx";
const csvData = await readXlsx(filename);
console.log(csvData);
```

See the documentation on jsr:
[https://jsr.io/@maheshbansod/xlsx/doc/~/readXlsx](https://jsr.io/@maheshbansod/xlsx/doc/~/readXlsx).
