import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { money } from './money';

export interface ReceiptData {
  receiptNo: string;
  churchName: string;
  memberName: string;
  campaignName: string;
  amount: number;
  currency: string;
  totalPaid: number;
  balance: number;
  method: string;
  occurredAt: string;
  collectorName: string;
  verificationToken: string;
  verifyBaseUrl?: string; // page publique optionnelle de vérification
}

/** Construit le PDF du reçu et retourne le document jsPDF (imprimable ou partageable). */
export async function buildReceiptPdf(data: ReceiptData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: [80, 150] }); // format ticket, adapté à une petite imprimante
  const verifyUrl = `${data.verifyBaseUrl ?? window.location.origin}/verify/${data.verificationToken}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 200 });

  let y = 8;
  doc.setFontSize(12);
  doc.text(data.churchName, 40, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9);
  doc.text('Reçu de contribution', 40, y, { align: 'center' });
  y += 4;
  doc.text(`N° ${data.receiptNo}`, 40, y, { align: 'center' });
  y += 6;

  doc.setFontSize(8);
  const line = (label: string, value: string) => {
    doc.text(label, 6, y);
    doc.text(value, 74, y, { align: 'right' });
    y += 5;
  };
  line('Membre', data.memberName);
  line('Campagne', data.campaignName);
  line('Montant versé', money(data.amount, data.currency));
  line('Moyen de paiement', data.method);
  line('Total déjà versé', money(data.totalPaid, data.currency));
  line('Solde restant', money(data.balance, data.currency));
  line('Date', new Date(data.occurredAt).toLocaleString('fr-CD'));
  line('Percepteur', data.collectorName);

  y += 2;
  doc.addImage(qrDataUrl, 'PNG', 25, y, 30, 30);
  y += 33;
  doc.setFontSize(6.5);
  doc.text('Scannez pour vérifier ce reçu', 40, y, { align: 'center' });
  y += 5;
  doc.text("Ce reçu ne peut pas être modifié après émission.", 40, y, { align: 'center', maxWidth: 70 });

  return doc;
}

export async function downloadReceipt(data: ReceiptData) {
  const doc = await buildReceiptPdf(data);
  doc.save(`${data.receiptNo}.pdf`);
}
