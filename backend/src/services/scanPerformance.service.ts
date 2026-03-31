import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// Performance optimization service for scanning operations
interface Scanner {
  id: string;
  name: string;
  type: string;
  status: string;
  connection: string;
}

interface ScannerCache {
  scanners: Scanner[];
  lastUpdated: number;
  expiration: number;
}

// Cache scanner discovery results for 2 minutes
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
let scannerCache: ScannerCache | null = null;

// Optimized network device check with shorter timeout
export const checkNetworkDeviceOptimized = (ip: string): Promise<boolean> => {
  return new Promise((resolve) => {
    // Reduced timeout from 3000ms to 1000ms
    exec(`ping -n 1 -w 500 ${ip}`, { timeout: 1000 }, (error) => {
      resolve(!error);
    });
  });
};

// Fast USB scanner detection with reduced timeout
export const detectUsbScannersOptimized = (): Promise<Scanner[]> => {
  return new Promise((resolve) => {
    const devices: Scanner[] = [];

    // Reduced timeout from 15000ms to 5000ms
    const usbScannerCommand = `powershell -Command "Get-WmiObject -Class Win32_PnPEntity | Where-Object { ($_.PNPClass -eq 'Image' -or $_.PNPClass -eq 'Camera' -or $_.Name -match 'scanner|scan|imaging|wia') -and $_.DeviceID -match 'USB' } | Select-Object Name, DeviceID, Status, PNPClass | ConvertTo-Json"`;

    exec(usbScannerCommand, { timeout: 5000 }, (error, stdout) => {
      if (!error && stdout.trim()) {
        try {
          const result = JSON.parse(stdout);
          const items = Array.isArray(result) ? result : [result];
          items.forEach((item: any, index: number) => {
            if (item && item.Name) {
              devices.push({
                id: `usb-${index}`,
                name: item.Name,
                type: 'scanner',
                status: item.Status === 'OK' ? 'ready' : 'offline',
                connection: 'USB'
              });
            }
          });
        } catch (e) {
          // JSON parse failed, ignore
        }
      }
      resolve(devices);
    });
  });
};

// Optimized WIA device detection
export const detectWiaDevicesOptimized = (): Promise<Scanner[]> => {
  return new Promise((resolve) => {
    const devices: Scanner[] = [];

    // Reduced timeout from 15000ms to 4000ms
    const wiaCommand = `powershell -Command "Get-WmiObject -Query 'SELECT * FROM Win32_PnPEntity WHERE Service=''stisvc'' OR PNPClass=''Image''' | Select-Object Name, DeviceID, Status | ConvertTo-Json"`;

    exec(wiaCommand, { timeout: 4000 }, (error, stdout) => {
      if (!error && stdout.trim()) {
        try {
          const result = JSON.parse(stdout);
          const items = Array.isArray(result) ? result : [result];
          items.forEach((item: any, index: number) => {
            if (item && item.Name) {
              const isUsb = item.DeviceID?.includes('USB');
              devices.push({
                id: `wia-${index}`,
                name: item.Name,
                type: 'scanner',
                status: item.Status === 'OK' ? 'ready' : 'offline',
                connection: isUsb ? 'USB' : 'Other'
              });
            }
          });
        } catch (e) {
          // JSON parse failed, ignore
        }
      }
      resolve(devices);
    });
  });
};

// Optimized multifunction printer detection
export const detectMfpDevicesOptimized = (): Promise<Scanner[]> => {
  return new Promise((resolve) => {
    const devices: Scanner[] = [];

    // Reduced timeout from 15000ms to 4000ms
    const printerCommand = `powershell -Command "Get-WmiObject -Class Win32_Printer | Where-Object { $_.Local -eq 'True' -and $_.PortName -match 'USB' } | Select-Object Name, PortName, PrinterStatus, Local, WorkOffline, PrinterState | ConvertTo-Json"`;

    exec(printerCommand, { timeout: 4000 }, (error, stdout) => {
      if (!error && stdout.trim()) {
        try {
          const result = JSON.parse(stdout);
          const printers = Array.isArray(result) ? result : [result];
          printers.forEach((printer: any, index: number) => {
            if (printer && printer.Name) {
              // Skip virtual printers
              const isVirtualPrinter = /Microsoft (XPS|Print to PDF)|OneNote|Fax/i.test(printer.Name);
              if (isVirtualPrinter) return;

              const isUsb = printer.Local && printer.PortName?.includes('USB');
              const isOffline = printer.WorkOffline === true ||
                               printer.PrinterStatus === 6 ||
                               printer.PrinterStatus === 5 ||
                               printer.PrinterStatus === 7;
              const isReady = !isOffline && (printer.PrinterStatus === 0 || printer.PrinterStatus === 2 || printer.PrinterStatus === 3 || printer.PrinterStatus === 4);

              if (isUsb) {
                devices.push({
                  id: `mfp-${index}`,
                  name: printer.Name,
                  type: 'multifunction',
                  status: isReady ? 'ready' : 'offline',
                  connection: 'USB'
                });
              }
            }
          });
        } catch (e) {
          // JSON parse failed, ignore
        }
      }
      resolve(devices);
    });
  });
};

// Fast NAPS2 WIA scanner detection with reduced timeout
export const detectNaps2ScannersOptimized = (naps2Path: string): Promise<Scanner[]> => {
  return new Promise(async (resolve) => {
    const devices: Scanner[] = [];
    const seenNames = new Set<string>();

    // Add known network scanners with faster ping checks
    const knownNetworkScanners = [
      { id: 'escl-known-0', name: 'EPSON L5290 Series (192.168.1.40)', ip: '192.168.1.40', type: 'scanner', connection: 'Network' },
      { id: 'escl-known-1', name: 'EPSON L6460 Series (192.168.1.109)', ip: '192.168.1.109', type: 'scanner', connection: 'Network' }
    ];

    // Check network scanners in parallel with faster timeout
    try {
      const networkChecks = await Promise.allSettled(
        knownNetworkScanners.map(async (scanner) => {
          const isOnline = await checkNetworkDeviceOptimized(scanner.ip);
          return {
            id: scanner.id,
            name: scanner.name,
            type: scanner.type,
            status: isOnline ? 'ready' : 'offline',
            connection: scanner.connection
          };
        })
      );

      networkChecks.forEach((result) => {
        if (result.status === 'fulfilled') {
          seenNames.add(result.value.name.toLowerCase());
          devices.push(result.value);
        }
      });
    } catch (error) {
      console.log('Network scanner check failed, continuing without network devices');
    }

    // WIA devices detection with reduced timeout (from 20000ms to 8000ms)
    exec(`"${naps2Path}" --listdevices --driver wia`, { timeout: 8000 }, (wiaError, wiaStdout) => {
      if (!wiaError && wiaStdout.trim()) {
        const lines = wiaStdout.split('\n').filter(line => line.trim());
        lines.forEach((name, index) => {
          const trimmedName = name.trim();
          if (trimmedName && !seenNames.has(trimmedName.toLowerCase())) {
            seenNames.add(trimmedName.toLowerCase());
            devices.push({
              id: `wia-${index}`,
              name: trimmedName,
              type: 'scanner',
              status: 'ready',
              connection: 'USB'
            });
          }
        });
      }
      resolve(devices);
    });
  });
};

// Optimized scanner discovery with caching and parallel execution
export const detectAllScannersOptimized = async (naps2Path?: string): Promise<Scanner[]> => {
  // Check cache first
  if (scannerCache && Date.now() - scannerCache.lastUpdated < CACHE_DURATION) {
    console.log('Using cached scanner results');
    return scannerCache.scanners;
  }

  const allDevices: Scanner[] = [];
  const seenNames = new Set<string>();

  try {
    // Execute all discovery methods in parallel for maximum speed
    const discoveryPromises = [];

    // USB/WIA detection
    discoveryPromises.push(detectUsbScannersOptimized());
    discoveryPromises.push(detectWiaDevicesOptimized());
    discoveryPromises.push(detectMfpDevicesOptimized());

    // NAPS2 detection if available
    if (naps2Path && fs.existsSync(naps2Path)) {
      discoveryPromises.push(detectNaps2ScannersOptimized(naps2Path));
    }

    // Wait for all discoveries to complete with timeout
    const results = await Promise.allSettled(discoveryPromises);

    // Process results
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        result.value.forEach((device: Scanner) => {
          const key = device.name.toLowerCase();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            allDevices.push(device);
          }
        });
      }
    });

    // Sort: USB scanners first, then other scanners, then multifunction printers
    allDevices.sort((a, b) => {
      if (a.connection === 'USB' && b.connection !== 'USB') return -1;
      if (a.connection !== 'USB' && b.connection === 'USB') return 1;
      if (a.type === 'scanner' && b.type !== 'scanner') return -1;
      if (a.type !== 'scanner' && b.type === 'scanner') return 1;
      return a.name.localeCompare(b.name);
    });

    // Update cache
    scannerCache = {
      scanners: allDevices,
      lastUpdated: Date.now(),
      expiration: Date.now() + CACHE_DURATION
    };

    console.log(`Scanner discovery completed in optimized mode. Found ${allDevices.length} devices.`);
    return allDevices;

  } catch (error) {
    console.error('Optimized scanner discovery failed:', error);
    return [];
  }
};

// Clear scanner cache (useful for refresh operations)
export const clearScannerCache = (): void => {
  scannerCache = null;
  console.log('Scanner cache cleared');
};

// Get cache status
export const getScannerCacheStatus = () => {
  if (!scannerCache) {
    return { cached: false, devices: 0, age: 0 };
  }

  return {
    cached: true,
    devices: scannerCache.scanners.length,
    age: Date.now() - scannerCache.lastUpdated,
    expires: scannerCache.expiration - Date.now()
  };
};

// Performance metrics
export const getPerformanceMetrics = () => {
  return {
    cacheStatus: getScannerCacheStatus(),
    optimizations: {
      usbScanTimeout: '5000ms (reduced from 15000ms)',
      wiaTimeout: '4000ms (reduced from 15000ms)',
      mfpTimeout: '4000ms (reduced from 15000ms)',
      naps2WiaTimeout: '8000ms (reduced from 20000ms)',
      networkPingTimeout: '1000ms (reduced from 3000ms)',
      cacheExpiration: '2 minutes',
      parallelDiscovery: 'enabled'
    }
  };
};

export default {
  detectAllScannersOptimized,
  clearScannerCache,
  getScannerCacheStatus,
  getPerformanceMetrics,
  checkNetworkDeviceOptimized
};