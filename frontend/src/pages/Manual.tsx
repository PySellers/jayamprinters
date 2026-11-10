import { useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, InputAdornment, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PrintIcon from '@mui/icons-material/Print';
import SearchIcon from '@mui/icons-material/Search';
import { useAuth } from '../context/AuthContext';
import { SUPPORT } from './About';

interface Section {
  id: string;
  title: string;
  who: string;
  steps: (string | { head: string; items: string[] })[];
}

/** The user guide. Written for the people at the counter and on the shop floor, in the order they work. */
const SECTIONS: Section[] = [
  {
    id: 'start', title: '1. Getting started', who: 'Everyone',
    steps: [
      'Open the website and sign in with the e-mail and password the Admin gave you. You stay signed in for 3 hours; after that the sign-in page appears again and you simply sign in.',
      'The blue bar at the top shows the page you are on. At its right end is your profile button (your initials): Edit profile, Manual (this guide), Contacts, About and Logout are all there.',
      'The menu on the left lists the pages you may use. You only see the pages your role allows. On a small screen the menu opens with the three-line button.',
      'The small bar at the very bottom shows the copyright and who built the software.',
    ],
  },
  {
    id: 'dashboard', title: '2. The Dashboard and Live Jobs', who: 'Everyone',
    steps: [
      'The home page opens on the order form (Start New Order). In the strip at the top the big RED button is Live Jobs: it shows how many jobs are running. Click it and the page changes to the Live Jobs board - every job on one page. The button then reads "Order online"; click it to go back to the order form.',
      'The light-blue buttons Quotations, Job Cards and Invoices next to it show the totals; click one to open that list.',
      'Above the order form the Dashboard warns you about two things: "Payments due" (customers who promised to pay the balance on a day that has come - press Remind to open a ready WhatsApp message with the amount) and "Stock to buy" (paper or material that is low or finished).',
      {
        head: 'Live Jobs',
        items: [
          'Click any job to open its tracking page.',
          'Urgent jobs are red and bold with an URGENT tag, and are listed first. Overdue jobs show OVERDUE in red.',
          'The coloured chips (Design, Proof approval, Printing, Binding / finishing, Packing & handover, Delivered) show how many jobs are in each stage - click one to see only those.',
          'Each job shows the person and the step that has it ("Raja - Printing"). If nobody has taken the step yet it shows the section instead.',
          'Use the search box for a job number, customer or product. The list refreshes by itself every 20 seconds.',
        ],
      },
    ],
  },
  {
    id: 'order', title: '3. Taking an order', who: 'Counter, Admin',
    steps: [
      'On the Dashboard (or Quotations > New) choose the Service first - the buttons list every service; use the search box above them to find one quickly.',
      'Type the customer\'s phone number. If the customer is already saved their details fill in by themselves; otherwise fill in the name and phone and they are saved as a new customer.',
      'Choose the item and options (paper, size, colour, sides ...). Fields marked with * must be answered. For finishing choices (for example cutting, foiling, lamination) pick None, one of the options, or Custom to type your own text and price.',
      'Bill books and multi-copy sets: every copy has its own Paper name, GSM and Paper size. Set the top (primary) copy first, then the others.',
      'The price appears as you choose. Tap "Why this rate?" to see how it was worked out and, for the Admin, a link straight to the place in Pricing Setup where that rate is set.',
      'Discount: type a percentage or an amount in the Discount box. It is spread over the lines, GST is worked out after it, and it is printed on the bill.',
      'Mark Urgent for rush jobs - the job shows in red everywhere until it is delivered.',
      'Choose the proof dates (Proof 1, Proof 2) and the delivery date and time, then press "Generate Invoice & Job Card". The invoice and the job card are created together and the job starts moving through its steps.',
    ],
  },
  {
    id: 'invoices', title: '4. Invoices, bills and payments', who: 'Counter, Accounts, Admin',
    steps: [
      'Invoices lists every bill. Open one to print the GST bill, the cash bill, the A4 or thermal version, and to record payments (cash, UPI, card, bank).',
      'The bill shows the rate of each line, the discount and the GST. The Rate column has a "Why this rate?" button.',
      'The paid and balance amounts update with every payment. A fully paid invoice shows PAID.',
    ],
  },
  {
    id: 'jobcard', title: '5. The job card', who: 'Everyone',
    steps: [
      'Open Job Cards and click a job. The top shows the live status, who has the job now, the customer, service, quantity and delivery time.',
      'Specification lists every choice made for the job, including the paper, GSM and size of each copy and the finishing extras.',
      'Design proofs: see how many proofs there are, who is looking after each, and mark one Sent, Approved or Changes needed.',
      'Print this job card: "Print without price" for the shop floor, "Print with price" for the office. The print always shows the status as it is right now, so print it again after it changes.',
      {
        head: 'The printing job card form',
        items: [
          'Below the details is the paper job card. It is already filled in from the order: party, job name, size, type of printing, paper range / GSM / colour / quantity of every copy, cutting size, proof and delivery dates, remarks and the payment column.',
          'The Job Position ticks follow the real progress (proofs, printing, binding, ready, delivery, payment).',
          'You can change anything on the form and press Save. What you saved is kept; blank boxes fill from the order again.',
          '"Fill again from the order" throws away your typing and shows the order\'s values again.',
          'Or print it and write the rest by hand.',
        ],
      },
      {
        head: 'Tasks: who is doing what',
        items: [
          'Every job has tasks (steps) such as Design, Proof approval, Printing, Binding, Handover.',
          'Employees: press "Take it" on the task you will do. It is then yours and your name shows against that section on Live Jobs. Then Start, and Done when finished - the job moves to the next team by itself.',
          'Admin / Counter: press "Assign" to give a task to a particular person.',
          'Need an extra task that is not in the usual list (for example Foil stamping, Packing in boxes, Outside lamination)? Press "Add a task", type its name, choose who does it (the section), and choose which task it comes after. It is placed between the other tasks in that order.',
          'Hold puts a task on hold with a reason (for example waiting for the customer).',
        ],
      },
    ],
  },
  {
    id: 'work', title: '6. My Work and the Production board', who: 'Employees, Counter, Admin',
    steps: [
      'My Work lists the tasks waiting for you and the tasks of your section that nobody has taken. The number in the menu is how many are open.',
      'Production shows the whole shop by section: what is waiting, what is running and what is on hold. Admin and Counter also see the figures per employee.',
    ],
  },
  {
    id: 'pricing', title: '7. Pricing Setup', who: 'Admin',
    steps: [
      'Choose a service with the buttons at the top (they work like the service buttons on the Dashboard).',
      'Attributes: the choices a customer picks (paper, size ...) and any extra price per choice.',
      'Quantity Slabs: the rate for each quantity band. "Master / Additional" means the first sheet costs one rate and every further sheet another.',
      'Extra Charges: finishing and other charges. Tick "must choose" to make a section a required dropdown at the counter.',
      'Printing & Tax: the printing charge by quantity (for example up to 1,000 = Rs.500, then Rs.2,000 for each further 1,000) and the GST rate.',
      'Changes apply to new orders only. Bills already made keep the price they were made with.',
    ],
  },
  {
    id: 'others', title: '8. Customers, Products, Stock and Purchases', who: 'By role',
    steps: [
      'Customers: add, search and edit customers; each one shows their orders and balance.',
      'Products: items per service. A minimum order quantity can be set on an item (for example visiting cards: 50).',
      'Inventory: stock of paper and materials. Purchases: supplier bills (a photo of the bill can be read automatically when the reader is switched on). Outsource: work sent to outside companies and when it is due back. Cash Ledger: money in and out.',
    ],
  },
  {
    id: 'reports', title: '9. Reports and AI Insights', who: 'Admin only',
    steps: [
      'Reports (Admin only): the financial statement - sales, GST, costs, profit and margin by day, week or month, with an Excel download.',
      {
        head: 'AI Insights (Admin only)',
        items: [
          'Sales and a forecast for the next three months, with the busiest days of the week.',
          'Each service: sales, share, growth, discount given and how fast it is delivered.',
          'Employee performance: tasks finished, speed compared with the team, rework and a score. It only counts tasks that employees Take / Start / Done themselves, so ask the team to do that.',
          'Work sections: where jobs wait the longest (the bottleneck).',
          'Open jobs that will probably miss their delivery date, money customers still owe, customers who stopped ordering.',
          'Advice in plain words, each with the numbers behind it. The forecasts are statistics from your own data and are less certain when there are only a few months of history.',
        ],
      },
    ],
  },
  {
    id: 'admin', title: '10. Users, Work Centers and Workflows', who: 'Admin',
    steps: [
      'Users: add an employee (name, e-mail, phone, role and a first password), switch them off when they leave, or reset their password.',
      'Work Centers: the sections of the shop (Design, Printing, Finishing & Binding ...) and who is in each. An employee who is in no section can take any task nobody has taken yet.',
      'Workflows: the usual tasks of each service in order. Change it here and every new job follows it; add one-off tasks on the job card itself.',
      'Masters / Taxes / HSN codes / Company details: the shop\'s own settings and the printed details on the bills.',
    ],
  },
  {
    id: 'worklog', title: '10b. Work Log: each person\'s own work', who: 'Everyone (employees see their own)',
    steps: [
      'Every worker updates their own work: take a task, Start it, press "Add update" to write what is done so far ("printed 600 of 1000"), and press Done when finished. The update is saved under your name.',
      'Work Log (menu): the Admin and the Counter choose an employee and the days (today, last 7 days, this month, custom) and get only that person\'s work - every task they took, started or finished, with the times, how long each took, notes and updates. Leave "Everyone" to see one line per employee and click a name to open theirs.',
      'Filter Finished or Still open, and press Excel to download just that person\'s work. An employee sees only their own Work Log.',
    ],
  },
  {
    id: 'v13', title: '11. New in version 1.3', who: 'Everyone',
    steps: [
      {
        head: 'Taking an order',
        items: [
          'The paper (paper name, board, GSM, paper size) is asked first, before colour, sides and finishing.',
          'Services with sub-categories (for example Rubber Stamp) ask the Sub-category first and then the size. The Admin manages them under Pricing Setup > Items & Sub-categories.',
          'Binding Services (and visiting cards) have required extras: for each one choose None, one of the options, or Custom to type your own. Binding options can be added by the Admin in Pricing Setup > Extra Charges (pick the section, for example Binding, and add the option).',
          'Advance received: type the amount, how it was paid (cash, UPI, bank transfer, card) and for UPI / bank the id or reference and a photo of the receipt. The invoice and the bills show Advance and Balance.',
          '"Balance will be paid by": if the customer pays the rest later, choose the day. On that day the Dashboard lists it under Payments due with a Remind button (WhatsApp message with the amount). You can also set or clear the day on the invoice page.',
          'Below the Generate button you see the customer\'s earlier orders, one line each (date, bill, item, quantity, amount, balance) and a short summary - use it to give regular customers a better discount.',
        ],
      },
      {
        head: 'Payments and receipts',
        items: [
          'Every payment - from customers, to suppliers (Purchases) and to outside companies (Outsource) - can carry the UPI id, the bank details, the reference number and an uploaded photo / PDF of the receipt. A paperclip on the payment opens it.',
        ],
      },
      {
        head: 'Stock',
        items: [
          'Purchases: tick "One-time item" on a line for something bought for one job only. It is on the bill but is not added to the stock.',
          'Inventory: tick "Customer\'s own material" and choose the customer for paper or material a customer brought. It is kept apart and is not in the shop\'s buy list.',
          'Job card > Materials used: choose the stock item and quantity; it is taken off the stock at once and put back if you remove the line.',
          'Set a reorder level on each item. When it is reached (or the stock is zero) the Dashboard shows "Stock to buy" and Inventory marks it Low or Empty.',
        ],
      },
      {
        head: 'Job cards and bills',
        items: [
          'Every line of the Job Cards list has a Print button at its end for the paper job card (with or without price). It prints on A4 landscape.',
          'The paper job card shows only what belongs to the service: Xerox and Printout have no ink colours, margins, proofs or copy rows; bill books have a row per copy, margins and numbering; offset jobs have colours and proofs. Add more proof lines with "Add proof".',
          'The job card printed "with price" leaves out the production steps and shows the price list, advance and balance, the design proofs and the delivery date.',
          'The GST invoice and the cash bill follow the printed bill books (lavender page, logo, particulars with every option chosen, advance and balance). The delivery challan prints as a white form with blue outlines, ready for the yellow challan paper.',
        ],
      },
      {
        head: 'Admin',
        items: [
          'Customers > Export contacts: every customer and employee phone number as a .vcf file (open on the phone) or a Google Contacts .csv (contacts.google.com > Import).',
          'Reports > Account statement: like a bank statement - serial number, date, particulars, debit, credit and balance, per day or per week, with the number of invoices and purchases in each group and a grand total. Choose Sales and purchases, or Money in and out. Download to Excel.',
        ],
      },
      {
        head: 'Help chat',
        items: [
          'The round button at the bottom right of every page opens the help chat. Type a question in your own words ("how do I add an advance?") and it shows the answer from this manual and a button to open the page. If it cannot answer, it gives the support contact.',
        ],
      },
    ],
  },
  {
    id: 'help', title: '12. Something not working?', who: 'Everyone',
    steps: [
      'The sign-in page appeared by itself: your 3 hours were up - sign in again.',
      '"This step belongs to ...": someone else has taken that task. Ask the Admin or Counter to reassign it.',
      'You cannot see a page that a colleague can: your role does not include it. Ask the Admin.',
      `For anything else contact PySellers Services: ${SUPPORT.email}, ${SUPPORT.phone}, ${SUPPORT.website}. Mention the version shown under About.`,
    ],
  },
];

const ROLE_ROWS: [string, string, string, string, string][] = [
  ['Customers, quotations, orders, invoices, job cards', 'Yes', 'Yes', 'Yes', 'Yes'],
  ['Take / start / finish tasks', 'Yes', 'Yes', 'Yes', 'No'],
  ['Assign tasks, change task order, skip', 'Yes', 'Yes', 'No', 'No'],
  ['Work Log: pull out one person\'s work', 'Yes', 'Yes', 'Own only', 'No'],
  ['Add a task to a job', 'Yes', 'Yes', 'Only on a job they hold', 'No'],
  ['Delete invoices, job cards or payments', 'Yes', 'No', 'No', 'Payments only'],
  ['Outsource', 'Yes', 'Yes', 'No', 'Yes'],
  ['Purchases, Cash Ledger', 'Yes', 'No', 'No', 'Yes'],
  ['Pricing Setup (incl. items and sub-categories), Users, Masters, Work Centers, Workflows', 'Yes', 'No', 'No', 'No'],
  ['Export contacts (Customers page)', 'Yes', 'No', 'No', 'No'],
  ['Reports (sales, profit, account statement) and AI Insights', 'Yes', 'No', 'No', 'No'],
];

export default function Manual() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | false>('start');

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return SECTIONS;
    return SECTIONS.filter((s) => JSON.stringify(s).toLowerCase().includes(needle));
  }, [search]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }} className="manual-page">
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>User Manual</Typography>
          <Typography variant="body2" color="text.secondary">How to use the Sri Jayam Printers billing and job software, step by step.</Typography>
        </Box>
        <Stack direction="row" spacing={1} className="no-print">
          <TextField
            size="small" placeholder="Search the manual" value={search} onChange={(e) => { setSearch(e.target.value); setOpen(false); }} sx={{ width: 240 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { 'data-testid': 'manual-search' } }}
          />
          <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>Print</Button>
        </Stack>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        You are signed in as <strong>{user?.name}</strong> ({user?.role}). Sections say who they are for; you only see the screens your role allows.
      </Typography>

      {shown.length === 0 && <Typography color="text.secondary">Nothing in the manual matches &quot;{search}&quot;.</Typography>}
      {shown.map((s) => {
        const expanded = search.trim() ? true : open === s.id;
        return (
          <Accordion key={s.id} expanded={expanded} onChange={(_, v) => setOpen(v ? s.id : false)} disableGutters sx={{ mb: 1, borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid #dfe4f1' }} data-testid="manual-section">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 800, color: '#1a237e', flexGrow: 1 }}>{s.title}</Typography>
              <Chip size="small" variant="outlined" label={s.who} sx={{ mr: 1 }} />
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {s.steps.map((step, i) =>
                  typeof step === 'string' ? (
                    <Typography key={i} variant="body2">&bull; {step}</Typography>
                  ) : (
                    <Box key={i} sx={{ pl: 1, borderLeft: '3px solid #c5cae9' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{step.head}</Typography>
                      {step.items.map((item, j) => <Typography key={j} variant="body2" sx={{ ml: 1 }}>&ndash; {item}</Typography>)}
                    </Box>
                  ),
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}

      {!search.trim() && (
        <Paper sx={{ mt: 2, borderRadius: 2, overflowX: 'auto' }} variant="outlined">
          <Typography variant="subtitle1" sx={{ fontWeight: 800, p: 2, pb: 0.5, color: '#1a237e' }}>Who can do what</Typography>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>What</TableCell><TableCell>Admin</TableCell><TableCell>Counter</TableCell><TableCell>Production</TableCell><TableCell>Accounts</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {ROLE_ROWS.map((r) => (
                <TableRow key={r[0]}>{r.map((c, i) => <TableCell key={i} sx={i === 0 ? { fontWeight: 600 } : undefined}>{c}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
