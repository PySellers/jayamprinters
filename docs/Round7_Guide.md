# Sri Jayam ERP - prices for every service and the price panel (version 1.4.0)

Client comment: *the price is not updating in the order list; put a reasonable price (Chennai market) for every pricing set-up of every service so the business can check and change it from the link in the price display; show the price parts separately, highly visible at the right corner, updating as the sections are chosen; test every service thoroughly.*

## What was wrong

A full walk of all 17 services (every option combination x every quantity band) found why some orders showed no price:

| Service | Problem | Fix |
|---|---|---|
| **Binding Services** | None of the items could be priced: the screen requires Binding Material **and** Wrapper Print Type, but each item's rates use only one of them | An item is priced by the drop-downs its own rates use; the other drop-downs no longer block the price and are optional for that item |
| **Book Covers** | None of the 4 items could be priced (paper and size both required, rates use one) | Same |
| **Invitation - Redymade** | Not priced once a paper was chosen | Same |
| Xerox | A2 / A1 / A0 double side had no rate (30 combinations) | Starting rate filled (double side = one side x 1.8) |
| Printout | "Front & Back" for 1 page, Mirror Board front & back, ID copies had no rate (7) | Starting rate filled |
| Book Covers, Register, Transfer Certificate, Visiting Card | No rate above the last quantity band: a big order showed no price | Open-ended top band priced 5 % under the last band |
| Register / Transfer Certificate | The screen started at quantity 1 where there is no rate (first band 32 / 50) | The first band is their minimum order |
| Xerox binding | Rexine / Tape / Pin Binding at Rs 0 | Rs 120 / Rs 20 / Rs 5 per set |

The rule behind most of it is in `pricing_service.find_price_matrix_cell` (an item is priced by the attributes its rate cells use) and `ProductOut.price_attribute_ids`.

## Starting prices - `seed_round7_prices.py`

* Fills **only what is missing** - it never changes a price that is already set, so the owner's own prices are safe; running it again changes nothing.
* A missing rate comes from its nearest neighbour (double side = one side x 1.8 and the reverse), otherwise the average of that quantity band; rounded to Rs 0.05.
* Run on production after the deploy (as in the earlier rounds: a one-off Cloud Run job with `alembic upgrade head && python seed_round7_prices.py`; there is no migration in this round).
* These are **starting prices**. The owner checks them and changes them: from the order screen (price panel > **change**) or Pricing Setup / Products > Price Matrix.

## The price panel (order screen, top right)

* Sticky at the right of the order screen; on a phone it is shown above the form.
* The total in big figures ("including GST" / "cash bill"), then each line with **every part separately**: rate, option extras, each extra charge, printing charge, minimum charge, the line's share of the discount; each part has a coloured bar, a short explanation of how it was worked out and, for the Admin, a **change** link to the setting it came from.
* Sub-total, discount, CGST / SGST per HSN, GST total, TOTAL, and when an advance is typed: advance and **BALANCE TO PAY**.
* Until the item can be priced it says **what is still to be chosen** ("Still to choose: Side, Foiling ...") or that the owner has to set a rate.
* It updates as each section is chosen (about 0.3 s after the last click).

## Testing (see `docs/Sri_Jayam_ERP_Test_Report.xlsx`)

* `price_sweep.py` - walks every service and every option combination through the live pricing engine (also writes `price_sweep.json`, shown in the report sheet "Price coverage by service").
* `t_round7.py` - one API test per service ("every combination priced, > Rs 0"), one per service for "a bigger order never costs less", and the engine rules above.
* `ui_services.mjs` - for every service on the real order screen: panel position, price after choosing all options, parts add up to the line, CGST/SGST add up, the generated invoice equals the panel; plus quantity, discount, advance, no-GST and "still to choose" behaviour.
* `clean_test_data.py` - removes test leftovers from a LOCAL database (refuses to run against a non-local server).
