/*
 * MIKA COFFEE — QR code drawing
 *
 * Turns a link into a crisp SVG QR code (rounded modules, rounded corner eyes and a small cup
 * in the middle) that prints sharply at any size. Needs vendor/qrcode-generator-1.4.4.js.
 *
 *   MikaQR.svg(text, { color })          → SVG markup
 *   MikaQR.download(text, 'png' | 'svg', { color, filename })
 */
(function () {
    'use strict';

    const QUIET_ZONE = 4;    // modules of white space around the code, as the QR standard asks
    const MODULE_RADIUS = 0.3;
    const LOGO_SHARE = 0.22; // logo width as a share of the code; level H error correction absorbs it

    function encode(text) {
        if (typeof qrcode !== 'function') throw new Error('QR library did not load');
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        const qr = qrcode(0, 'H'); // 0 = pick the smallest size that fits, H = 30% damage tolerance
        qr.addData(String(text), 'Byte');
        qr.make();
        return qr;
    }

    const round = n => Math.round(n * 1000) / 1000;

    function roundedSquare(x, y, size, r) {
        const s = size - 2 * r;
        return `M${round(x + r)} ${round(y)}h${round(s)}a${r} ${r} 0 0 1 ${r} ${r}v${round(s)}a${r} ${r} 0 0 1 -${r} ${r}` +
               `h-${round(s)}a${r} ${r} 0 0 1 -${r} -${r}v-${round(s)}a${r} ${r} 0 0 1 ${r} -${r}z`;
    }

    function svg(text, options = {}) {
        const color = options.color || '#1C120C';
        const qr = encode(text);
        const n = qr.getModuleCount();
        const size = n + QUIET_ZONE * 2;
        const at = v => v + QUIET_ZONE;

        // The cup logo sits on a cleared, odd-sized square in the middle.
        let logo = Math.round(n * LOGO_SHARE);
        if (logo % 2 === 0) logo += 1;
        const logoStart = (n - logo) / 2;
        const inLogo = (r, c) => r >= logoStart && r < logoStart + logo && c >= logoStart && c < logoStart + logo;
        const inEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

        let modules = '';
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (qr.isDark(r, c) && !inEye(r, c) && !inLogo(r, c)) {
                    modules += roundedSquare(at(c), at(r), 1, MODULE_RADIUS);
                }
            }
        }

        const eye = (r, c) => {
            const x = at(c), y = at(r);
            return `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.9" fill="none" stroke="${color}" stroke-width="1"/>` +
                   `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="${color}"/>`;
        };

        const lx = at(logoStart), lw = logo;
        const scale = (lw - 1.6) / 24; // the cup is drawn on a 24-unit grid
        const cup =
            `<g transform="translate(${round(lx + 0.8)} ${round(lx + 0.8)}) scale(${round(scale)})" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
                '<path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" fill="#FFFFFF"/>' +
                '<path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/>' +
                '<path d="M8.5 3.5c-1 1.2 1 2.3 0 3.6M12.5 3.5c-1 1.2 1 2.3 0 3.6"/>' +
                '<path d="M4 21.5h14"/>' +
            '</g>';

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code">` +
            `<rect width="${size}" height="${size}" fill="#FFFFFF"/>` +
            `<path d="${modules}" fill="${color}"/>` +
            eye(0, 0) + eye(0, n - 7) + eye(n - 7, 0) +
            `<rect x="${lx - 0.4}" y="${lx - 0.4}" width="${lw + 0.8}" height="${lw + 0.8}" rx="${round(lw * 0.28)}" fill="#FFFFFF"/>` +
            `<rect x="${lx + 0.3}" y="${lx + 0.3}" width="${lw - 0.6}" height="${lw - 0.6}" rx="${round(lw * 0.24)}" fill="${color}"/>` +
            cup +
            '</svg>';
    }

    function save(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function download(text, format, options = {}) {
        const markup = svg(text, options);
        const name = options.filename || 'mika-qr';
        if (format === 'svg') {
            save(new Blob([markup], { type: 'image/svg+xml' }), `${name}.svg`);
            return;
        }
        // PNG: draw the SVG onto a large canvas so it stays sharp when printed.
        const px = options.size || 1200;
        const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Could not draw the QR code'));
                img.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = px;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, px, px);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            save(blob, `${name}.png`);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    window.MikaQR = { svg, download };
})();
