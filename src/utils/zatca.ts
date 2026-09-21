import QRCode from 'qrcode';
import type { Company, Branch } from '../types';

const tlv = (tag: number, value: string): number[] => {
  const buf = new TextEncoder().encode(value);
  return [tag, buf.length, ...buf];
};

export const zatcaTLV = (fields: { sellerName: string; vatNumber: string; timeISO: string; totalWithVat: number; vatAmount: number }): string => {
  const bytes = [
    ...tlv(1, fields.sellerName),
    ...tlv(2, fields.vatNumber),
    ...tlv(3, fields.timeISO),
    ...tlv(4, fields.totalWithVat.toFixed(2)),
    ...tlv(5, fields.vatAmount.toFixed(2)),
  ];
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export const zatcaTime = (date: string): string => new Date(`${date}T12:00:00`).toISOString();

export const sellerFor = (companies: Company[], branches: Branch[], branchId: string) => {
  const branch = branches.find((b) => b.id === branchId);
  const comp = companies.find((c) => c.id === branch?.companyId) || companies.find((c) => c.isActive) || companies[0];
  return { name: comp?.nameAr || comp?.nameEn || 'RestoCost', vatNumber: comp?.vatNumber || '' };
};

export const zatcaQrDataUrl = (tlvStr: string, size = 256): Promise<string> => QRCode.toDataURL(tlvStr, { width: size, margin: 1 });
