const path = require('path');
const ExcelJS = require('exceljs');

async function main() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Students');
  worksheet.columns = [
    { header: 'rollNo', key: 'rollNo', width: 16 },
    { header: 'name', key: 'name', width: 24 },
    { header: 'dateOfBirth', key: 'dateOfBirth', width: 16 },
    { header: 'attendance', key: 'attendance', width: 16 },
    { header: 'marks', key: 'marks', width: 12 }
  ];
  worksheet.addRows([
    { rollNo: '101', name: 'Jamie Lee', dateOfBirth: new Date('2005-04-17T00:00:00.000Z'), attendance: 85, marks: 75 },
    { rollNo: '102', name: 'Morgan Ray', dateOfBirth: new Date('2005-09-22T00:00:00.000Z'), attendance: 60, marks: 45 },
    { rollNo: '103', name: 'Alex Taylor', dateOfBirth: new Date('2004-12-03T00:00:00.000Z'), attendance: 90, marks: 80 }
  ]);
  worksheet.getColumn('dateOfBirth').numFmt = 'yyyy-mm-dd';
  const outputPath = path.join(process.cwd(), 'SampleData.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Sample spreadsheet created: ${outputPath}`);
}

main().catch((error) => {
  console.error('Could not create sample spreadsheet:', error.message);
  process.exitCode = 1;
});
