# Tarkkuustesti: 20/20 oikein

Ajettu 2026-11-14 07:36 UTC · portin kello kiinnitetty 2026-11-14T10:00:00+02:00 · hinnat ja saatavuus Aimon mock-rajapinnasta · keskimäärin 426 ms / pyyntö.

Oikein = tilaus täyttää pyynnön ehdot (tuoteryhmä, väittämät, nimi), kattaa määrän ilman ylitilausta, on yhtä halpa kuin riippumattoman oraakkelin halvin tilattava vaihtoehto, ja toimituspäivä sekä lopputila ovat odotetut.

| | Pyyntö | Tilaus | Tila | ms |
|---|---|---|---|---|
| ✅ | I need 1,000 litres of lactose-free milk by Monday. | 464306 × 1000 = 1010.00 € | confirmed | 117 |
| ✅ | Tarvitsen 1 000 litraa laktoositonta maitoa maanantaiksi | 464306 × 1000 = 1010.00 € | confirmed | 70 |
| ✅ | I need 1,000 litres of lactose-free milk by Monday. | 464306 × 1000 = 1010.00 € | pending_approval | 70 |
| ✅ | 1.000 l laktoositonta maitoa ma | 464306 × 1000 = 1010.00 € | confirmed | 77 |
| ✅ | 300 litraa maitoa maanantaiksi | 469477 × 300 = 264.00 € | confirmed | 145 |
| ✅ | a hundred litres of whole milk on Monday | 464073 × 100 = 164.00 € | confirmed | 127 |
| ✅ | luomu kevytmaitoa 40 litraa maanantaiksi | ei tilausta (oikein pysähtyi) | – | 21 |
| ✅ | 30 l whipping cream by Monday | 465193 × 18 = 104.94 € | confirmed | 124 |
| ✅ | 20 litraa laktoositonta kuohukermaa maanantaiksi | 465193 × 12 = 69.96 € | confirmed | 69 |
| ✅ | 20 kg voita maanantaiksi | 464411 × 40 = 132.00 € | confirmed | 128 |
| ✅ | 10 kg laktoositonta voita maanantaiksi | 463437 × 20 = 66.20 € | confirmed | 74 |
| ✅ | 20 kg voita ja 50 l kuohukermaa maanantaiksi | 464411 × 40 = 132.00 € · 465193 × 29 = 169.07 € | confirmed | 81 |
| ✅ | 60 l kaurajuomaa ja 10 kg sokeria maanantaiksi | 468465 × 60 = 70.20 € · 460460 × 1 = 24.27 € | confirmed | 141 |
| ✅ | 25 kg basmatiriisiä maanantaiksi | 473735 × 5 = 60.30 € | confirmed | 132 |
| ✅ | 10 kg gluteenitonta pastaa maanantaiksi | 462324 × 20 = 42.00 € | confirmed | 150 |
| ✅ | 50 kg lohifileetä maanantaiksi | ei tilausta (oikein pysähtyi) | – | 149 |
| ✅ | 200 litres of lactose-free milk by Sunday | 464306 × 200 = 202.00 € | pending_approval | 71 |
| ✅ | 100 litraa Arlan rasvatonta laktoositonta maitojuomaa maanantaiksi | 462775 × 51 + 464401 × 49 = 184.97 € | confirmed | 2123 |
| ✅ | 20 litraa laktoositonta maitoa maanantaiksi | 464306 × 20 = 20.20 € | pending_approval | 30 |
| ✅ | 2 kg unicorn meat | ei tilausta (oikein pysähtyi) | – | 4621 |
