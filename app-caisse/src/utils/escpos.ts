/**
 * Utilitaire ESC/POS — Impression thermique
 * Compatible Epson TM-T20/T88, Star TSP100, Bixolon
 */
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD = {
  INIT:            [ESC, 0x40],
  BOLD_ON:         [ESC, 0x45, 0x01],
  BOLD_OFF:        [ESC, 0x45, 0x00],
  DOUBLE_SIZE_ON:  [ESC, 0x21, 0x30],
  DOUBLE_SIZE_OFF: [ESC, 0x21, 0x00],
  ALIGN_LEFT:      [ESC, 0x61, 0x00],
  ALIGN_CENTER:    [ESC, 0x61, 0x01],
  ALIGN_RIGHT:     [ESC, 0x61, 0x02],
  CUT_FULL:        [GS,  0x56, 0x00],
  CUT_PARTIAL:     [GS,  0x56, 0x01],
};

export class EscPosPrinter {
  private device: any = null;
  private endpointOut = 1;
  private buffer: number[] = [];

  async connect(): Promise<boolean> {
    if (!(navigator as any).usb) return false;
    try {
      const filters = [
        { vendorId: 0x04b8 }, // Epson
        { vendorId: 0x0519 }, // Star Micronics
        { vendorId: 0x0dd4 }, // Bixolon
        { vendorId: 0x1504 }, // Sewoo
      ];
      this.device = await (navigator as any).usb.requestDevice({ filters });
      await this.device!.open();
      await this.device!.selectConfiguration(1);
      await this.device!.claimInterface(0);
      const ep = this.device!.configuration!.interfaces[0].alternates[0].endpoints
        .find((e: any) => e.direction === 'out' && e.type === 'bulk');
      this.endpointOut = ep?.endpointNumber ?? 1;
      return true;
    } catch {
      return false;
    }
  }

  isConnected() { return !!(this.device?.opened); }

  init()         { this.buffer.push(...CMD.INIT); return this; }
  feed(n = 1)    { for (let i = 0; i < n; i++) this.buffer.push(LF); return this; }
  cut(p = true)  { this.buffer.push(...(p ? CMD.CUT_PARTIAL : CMD.CUT_FULL)); return this; }
  bold(on = true){ this.buffer.push(...(on ? CMD.BOLD_ON : CMD.BOLD_OFF)); return this; }
  align(a: 'left'|'center'|'right' = 'left') {
    this.buffer.push(...({ left: CMD.ALIGN_LEFT, center: CMD.ALIGN_CENTER, right: CMD.ALIGN_RIGHT }[a]));
    return this;
  }
  text(s: string) { this.buffer.push(...Array.from(new TextEncoder().encode(s))); return this; }
  line(s = '')    { return this.text(s + '\n'); }
  separator(c = '-', w = 42) { return this.line(c.repeat(w)); }
  row(left: string, right: string, w = 42) {
    const sp = Math.max(1, w - left.length - right.length);
    return this.line(left + ' '.repeat(sp) + right);
  }

  async print(): Promise<boolean> {
    if (!this.device) return false;
    try {
      await this.device.transferOut(this.endpointOut, new Uint8Array(this.buffer));
      this.buffer = [];
      return true;
    } catch { return false; }
  }

  printFallback(html: string) {
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:8px}
        .c{text-align:center}.r{text-align:right}.b{font-weight:bold}.big{font-size:15px}
        hr{border:none;border-top:1px dashed #000;margin:5px 0}
        .row{display:flex;justify-content:space-between}
        @media print{@page{margin:0;size:80mm auto}}
      </style></head><body>${html}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 400);
  }
}

interface TicketSale {
  numero_ticket?: string;
  createdAt: string;
  items: Array<{ name: string; qty: number; price: number; currency: string }>;
  total: number;
  currency: string;
  paiements?: Array<{ methode: string; montant: number; devise: string }>;
  passengerName?: string;
  flightRef?: string;
  destination?: string;
  carteFidelite?: string;
  pointsGagnes?: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function buildTicketHtml(sale: TicketSale, cfg?: { nom?: string; adresse?: string; nif?: string; msg1?: string; msg2?: string; msgPolitesse?: string }): string {
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
  const d = new Date(sale.createdAt);
  const dateStr = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let html = `
    <div class="c b big">${esc(cfg?.nom || 'DUTY FREE')}</div>
    ${cfg?.adresse ? `<div class="c">${esc(cfg.adresse)}</div>` : ''}
    ${cfg?.nif ? `<div class="c">NIF : ${esc(cfg.nif)}</div>` : ''}
    <hr>
    <div class="c b">${esc(cfg?.msg1 || 'Bienvenue — Welcome')}</div>
    <div class="c">${esc(cfg?.msg2 || 'Zone de transit international')}</div>
    <hr>
    <div>Ticket : <b>${sale.numero_ticket || 'N/A'}</b></div>
    <div>Date : ${dateStr}</div>
    ${sale.passengerName ? `<div>Passager : ${esc(sale.passengerName)}</div>` : ''}
    ${sale.flightRef ? `<div>Vol : ${esc(sale.flightRef)}${sale.destination ? ' → ' + esc(sale.destination) : ''}</div>` : ''}
    <hr>`;

  sale.items.forEach(item => {
    html += `<div>${esc(item.name.substring(0, 32))}</div>`;
    html += `<div class="row"><span>  ${item.qty} x ${fmt(item.price)} ${item.currency}</span><span class="b">${fmt(item.qty * item.price)}</span></div>`;
  });

  html += `<hr><div class="row b big"><span>TOTAL</span><span>${fmt(sale.total)} ${sale.currency}</span></div>`;

  if (sale.paiements?.length) {
    html += `<hr>`;
    sale.paiements.forEach(p => {
      html += `<div class="row"><span>${p.methode.toUpperCase()}</span><span>${fmt(p.montant)} ${p.devise}</span></div>`;
    });
  }

  if (sale.carteFidelite) {
    html += `<hr><div class="c">Carte fidélité : ${sale.carteFidelite}</div>`;
    if (sale.pointsGagnes) html += `<div class="c b">+${sale.pointsGagnes} points gagnés</div>`;
  }

  html += `<hr><div class="c">${esc(cfg?.msgPolitesse || 'Merci. Bon voyage — Thank you. Safe travels.')}</div>`;
  html += `<br><div class="c" style="font-size:10px">Conservez ce ticket · Keep this receipt</div>`;
  return html;
}

export const escposPrinter = new EscPosPrinter();
