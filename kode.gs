var FOLDER_ID = "ID_FOLDER_DRIVE_ANDA"; 

function doPost(e) {
  try {
    if (!e.parameter.fdata) { 
      return ContentService.createTextOutput("Error: Data foto kosong!"); 
    }
    
    var rawBase64 = e.parameter.fdata.replace(/ /g, "+");
    while (rawBase64.length % 4 !== 0) { rawBase64 += "="; }
    var data = Utilities.base64Decode(rawBase64);
    
    var namaFile = "foto_pm_" + new Date().getTime() + ".jpg";
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var blob = Utilities.newBlob(data, "image/jpeg", namaFile);
    var file = folder.createFile(blob);
    
    var fileId = file.getId();
    var linkFoto = "https://drive.google.com/uc?export=view&id=" + fileId;
    
    return ContentService.createTextOutput(linkFoto);
    
  } catch (err) { 
    return ContentService.createTextOutput("Error: " + err.toString()); 
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var action = e.parameter.action;

  // 1. LOGIKA SIMPAN DATA PM (BAGIAN YANG DIPERBAIKI)
  if (action == "simpan") {
    try {
      var sheetName = e.parameter.sheet || "PM Harian";
      var sheetRiwayat = ss.getSheetByName(sheetName);
      
      if (!sheetRiwayat) {
        sheetRiwayat = ss.insertSheet(sheetName);
        sheetRiwayat.appendRow(["Tanggal", "Kategori", "Teknisi", "Nama Alat", "Lokasi", "Terminal", "Jam Mulai", "Jam Selesai", "Catatan", "Foto", "Checklist"]);
      }

      var paksaFormatJam = function(val) {
        if (!val || val == "") return "00:00";
        var s = val.toString().replace(".", ":");
        var parts = s.split(":");
        var hh = (parts[0] || "00").padStart(2, '0');
        var mm = (parts[1] || "00").padEnd(2, '0').substring(0, 2); 
        return hh + ":" + mm;
      };

      // SUSUNAN KOLOM: A(Tgl), B(Kategori), C(Teknisi), D(Nama), E(Lokasi), F(Term), G(Mulai), H(Selesai), I(Catatan), J(Foto), K(Checklist)
      sheetRiwayat.appendRow([
        Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy"),
        e.parameter.kategori || "", // MENGUNCI: Hanya ambil parameter kategori (FIDS/App)
        e.parameter.teknisi || "",
        e.parameter.nama || "",
        e.parameter.lokasi || "",
        e.parameter.terminal || "",
        paksaFormatJam(e.parameter.mulai),
        paksaFormatJam(e.parameter.selesai),
        e.parameter.catatan || "",
        e.parameter.foto || "",
        e.parameter.checklist || ""
      ]);

      SpreadsheetApp.flush(); 
      return ContentService.createTextOutput(JSON.stringify({status: "success"})).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 2. LOGIKA SUMMARY DASHBOARD
  if (action == "summary") {
    var res = { totalAlat: 0, t1: 0, t2: 0, t3: 0, nt: 0, riwayatTerakhir: [] };
    var terminalSheets = [{ nama: "Terminal 1", key: "t1" }, { nama: "Terminal 2", key: "t2" }, { nama: "Terminal 3", key: "t3" }, { nama: "Non Terminal", key: "nt" }];

    terminalSheets.forEach(function(item) {
      var sheet = ss.getSheetByName(item.nama);
      if (sheet) {
        var values = sheet.getDataRange().getValues();
        var count = 0;
        for (var i = 4; i < values.length; i++) {
          if (values[i][1] && values[i][1].toString().trim() !== "") { count++; }
        }
        res[item.key] = count;
        res.totalAlat += count;
      }
    });

    var pmSheets = ["PM Harian", "PM Mingguan", "PM Bulanan", "PM Triwulan", "PM Semester", "PM Tahunan"];
    var allRiwayat = [];

    pmSheets.forEach(function(sName) {
      var sheet = ss.getSheetByName(sName);
      if (sheet) {
        var data = sheet.getDataRange().getDisplayValues();
        if (data.length > 1) {
          for (var j = 1; j < data.length; j++) {
            var tgl = data[j][0].toString().trim();
            var namaAlat = data[j][3].toString().trim();
            if (tgl !== "" && tgl.toLowerCase() !== "tanggal" && namaAlat !== "") {
              allRiwayat.push([data[j][0], data[j][2], data[j][6], data[j][7], data[j][8], data[j][9], sName, data[j][3], data[j][4], data[j][5], data[j][10]]);
            }
          }
        }
      }
    });

    allRiwayat.sort(function(a, b) { return parseDate(b[0]) - parseDate(a[0]); });
    res.riwayatTerakhir = allRiwayat.slice(0, 5);
    
    // Hitung PM per terminal
    var pmPerTerminal = { t1: 0, t2: 0, t3: 0, nt: 0 };
    allRiwayat.forEach(function(row) {
      var terminal = row[9].toString().trim(); 
      if(terminal.indexOf('1') !== -1) pmPerTerminal.t1++;
      else if(terminal.indexOf('2') !== -1) pmPerTerminal.t2++;
      else if(terminal.indexOf('3') !== -1) pmPerTerminal.t3++;
      else pmPerTerminal.nt++;
    });
    res.pmPerTerminal = pmPerTerminal;

    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  // 3. LOGIKA GET RIWAYAT PER ALAT
  if (action == "getRiwayat") {
    var sheetsRiwayat = ["PM Harian", "PM Mingguan", "PM Bulanan", "PM Triwulan", "PM Semester", "PM Tahunan"];
    var namaAlat = e.parameter.nama;
    var filtered = [];
    for (var s = 0; s < sheetsRiwayat.length; s++) {
      var sheetR = ss.getSheetByName(sheetsRiwayat[s]);
      if (!sheetR) continue;
      var dataTeks = sheetR.getDataRange().getDisplayValues();
      for (var i = 1; i < dataTeks.length; i++) {
        if (dataTeks[i][3] && dataTeks[i][3].toString().trim() === (namaAlat ? namaAlat.trim() : "")) {
          filtered.push([dataTeks[i][0], dataTeks[i][2], dataTeks[i][6], dataTeks[i][7], dataTeks[i][8], dataTeks[i][9], sheetsRiwayat[s], dataTeks[i][3], dataTeks[i][4], dataTeks[i][5], dataTeks[i][10]]);
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify(filtered)).setMimeType(ContentService.MimeType.JSON);
  }

 // 4. LOGIKA DAFTAR ALAT (DINAMIS)
  var sheetNameDaftar = e.parameter.sheet || "Terminal 1";
  var sheetDaftar = ss.getSheetByName(sheetNameDaftar);
  
  if (!sheetDaftar) return ContentService.createTextOutput(JSON.stringify({status:"error", message:"Sheet tidak ditemukan"})).setMimeType(ContentService.MimeType.JSON);

  var dataAlat = sheetDaftar.getDataRange().getValues();
  var result = [];
  
  // Tentukan baris mulai (startRow)
  // Jika sheet adalah Terminal, mulai baris 5 (indeks 4)
  // Jika sheet adalah Aplikasi Pendukung, mulai baris 2 (indeks 1)
  var startRow = 4; 
  if (sheetNameDaftar === "Aplikasi Pendukung") {
    startRow = 1; 
  }

  for (var k = startRow; k < dataAlat.length; k++) {
    var namaAlat = dataAlat[k][1] ? dataAlat[k][1].toString().trim() : "";
    
    // Filter agar header tidak ikut masuk
    var isHeader = (namaAlat === "NAMA PERANGKAT" || namaAlat === "PUBLIC SERVICE IT & SYSTEM BSH" || namaAlat === "NAMA APLIKASI");

    if (namaAlat !== "" && !isHeader) {
      result.push([
        dataAlat[k][0], // Kolom A
        dataAlat[k][1], // Kolom B
        dataAlat[k][2], // Kolom C
        dataAlat[k][3], // Kolom D
        dataAlat[k][4]  // Kolom E
      ]);
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function parseDate(str) {
  if(!str) return new Date(0);
  var parts = str.split('/');
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

function pemicuIzin() {
  DriveApp.getFolderById("1660-SGJ8c5O1bJ71H4n-AJlvnMseM4SO");
  Logger.log("Izin berhasil didapatkan!");
}