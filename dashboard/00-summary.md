# Token Radar — ringkasan

Radar nilai implisit untuk 178 protokol pra-token dari snapshot DefiLlama 14 November 2026
(758 protokol, floor watchlist $50.000.000). Board memuat seluruh 40 protokol
watchlist house ditambah 138 protokol pra-token di bawah floor yang lolos filter
house — bukan bridge, liquid staking/restaking, atau CEX; bukan nama berversi,
wrapped, atau staked; bukan nama exchange. Protokol di atas floor yang tidak
masuk watchlist tidak dimasukkan.

## Model: radar-2

Nilai implisit = TVL × multiple kategori × growth × maturity × breadth.

- **Multiple kategori** — median mcap/TVL protokol live per kategori, minimal
  3 protokol live, dijepit 0,08–0,90. Kategori dengan kurang dari 3 protokol
  live memakai median global 0,2138 dari 128 protokol live (protokol live =
  snapshot mencatat kapitalisasi pasar di atas nol).
- **Growth** — 1 + perubahan TVL 7 hari (dijepit −40% sampai +60%) × 0,5.
  Tanpa data 7 hari dihitung 0%.
- **Maturity** — 0,7 + min(umur, 1095 hari) / 1095 × 0,3. Tanpa tanggal
  listing dihitung 365 hari.
- **Breadth** — 1 + 0,02 × min(jumlah chain − 1, 10).
- Tidak ada nama protokol yang diistimewakan: semua angka dihitung dari
  snapshot saat program berjalan.

Multiple yang dipakai per kategori (minimal 3 live): Lending 0,1324 (15 live),
Dexs 0,3424 (11), Liquid Staking 0,0800 (9), Yield 0,1914 (9), CEX 0,0800 (9),
RWA 0,2748 (9), Canonical Bridge 0,7464 (8), Basis Trading 0,6544 (7),
Bridge 0,5567 (6), Cross Chain Bridge 0,9000 (4), Yield Aggregator 0,1510 (4),
Indexes 0,1477 (3), CDP 0,1687 (3), Privacy 0,9000 (3). Total nilai implisit
board $3.155.981.574 atas TVL $15.410.003.598; median nilai implisit
$3.596.243.

## Top 10

| # | Protokol | Kategori | TVL | Nilai implisit |
|---|----------|----------|-----|----------------|
| 1 | Steakhouse Financial | Risk Curators | $2.753.981.495 | $593.137.929 |
| 2 | Gauntlet | Risk Curators | $1.577.685.462 | $353.258.563 |
| 3 | Veda | Onchain Capital Allocator | $1.563.415.482 | $335.717.823 |
| 4 | USDD | CDP | $1.055.793.606 | $158.420.774 |
| 5 | Upshift | Onchain Capital Allocator | $499.083.733 | $119.300.694 |
| 6 | Bittensor dTAO | Dexs | $376.026.255 | $89.089.824 |
| 7 | Nonce Capital | Risk Curators | $513.783.671 | $75.927.311 |
| 8 | OnRe | RWA | $308.882.355 | $70.798.208 |
| 9 | OpenTrade | RWA | $241.501.527 | $61.190.267 |
| 10 | Plume Vaults | RWA | $211.537.977 | $55.950.258 |

Kategori terbesar di board: Risk Curators (33 protokol), Dexs (20), RWA (15),
Yield (15), Onchain Capital Allocator (14), Lending (14).

## Cara memakai dashboard

Hero dan empat kartu stat memberi gambaran board; Top 10 spotlight menyorot
puncak; bar kategori membandingkan kategori; filter mencari nama/slug,
kategori, chain, TVL minimum, dan urutan. Tab Pre-token menampilkan board
lengkap, tab Live token menampilkan tabel asal multiple. Klik baris mana pun
untuk dialog detail: uraian lengkap model (TVL, multiple, growth, maturity,
breadth) dan 6 langkah farming dengan biaya dan waktu tiap langkah.

## Batasan

Nilai implisit adalah klaim entri ini, bukan prediksi harga dan bukan janji
token akan diterbitkan. "Tidak tercatat memiliki token" berarti snapshot
tidak mencatat tokennya — bukan bukti protokol itu tidak punya token.
Rencana farm bersifat umum (pelajari dokumen resmi, mulai kecil, pantau
tiap minggu, verifikasi kontrak dari kanal resmi sebelum klaim) dan tidak
pernah meminta persetujuan tanpa batas.
