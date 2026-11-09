import { useQuery } from '@tanstack/react-query';
import { Box, Divider, Link, Paper, Stack, Typography } from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LanguageIcon from '@mui/icons-material/Language';
import { accountApi } from '../api/accountApi';
import logo from '../assets/sjp-logo.png';

export const SUPPORT = {
  email: 'contact@pysellers.in',
  phone: '8838587824',
  website: 'www.pysellers.in',
};

const NEW_IN_THIS_VERSION = [
  'Staying signed in for 3 hours',
  'Profile menu: Edit profile, Manual, Contacts, About',
  'Job card form filled from the order, with live status ticks',
  'Take, assign and add tasks on the job card, visible on Live Jobs',
  'AI Insights for the Admin: forecasts, service and employee performance, advice',
];

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 0.75 }}>
      <Box sx={{ color: '#1a237e', display: 'flex' }}>{icon}</Box>
      <Typography variant="body2" color="text.secondary" sx={{ width: 80 }}>{label}</Typography>
      <Typography sx={{ fontWeight: 600 }}>{children}</Typography>
    </Stack>
  );
}

export default function About() {
  const about = useQuery({ queryKey: ['about'], queryFn: accountApi.about });
  const a = about.data;
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 820 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>About</Typography>
      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: { sm: 'center' } }}>
          <Box component="img" src={logo} alt="Sri Jayam Printers" sx={{ height: 110, width: 'auto', alignSelf: { xs: 'center', sm: 'flex-start' } }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#1a237e' }}>{a?.product ?? 'Sri Jayam Printers ERP'}</Typography>
            <Typography color="text.secondary">Billing, job cards and production tracking for Sri Jayam Printers.</Typography>
            <Stack direction="row" spacing={4} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
              <Box><Typography variant="caption" color="text.secondary">Version</Typography><Typography sx={{ fontWeight: 800 }} data-testid="about-version">{a?.version ?? '-'}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Released</Typography><Typography sx={{ fontWeight: 700 }}>{a?.release_date ?? '-'}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Stay signed in for</Typography><Typography sx={{ fontWeight: 700 }}>{a ? `${a.session_hours} hours` : '-'}</Typography></Box>
            </Stack>
          </Box>
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>New in this version</Typography>
        {NEW_IN_THIS_VERSION.map((t) => <Typography key={t} variant="body2">&bull; {t}</Typography>)}
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Developed by PySellers Services Pvt Ltd</Typography>
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          Need help, found something that does not work, or want a change? Please contact PySellers Services for any support request.
        </Typography>
        <Row icon={<EmailIcon />} label="E-mail"><Link href={`mailto:${SUPPORT.email}`} underline="hover" data-testid="about-email">{SUPPORT.email}</Link></Row>
        <Row icon={<PhoneIcon />} label="Phone"><Link href={`tel:+91${SUPPORT.phone}`} underline="hover" data-testid="about-phone">{SUPPORT.phone}</Link></Row>
        <Row icon={<LanguageIcon />} label="Website"><Link href={`https://${SUPPORT.website}`} target="_blank" rel="noopener noreferrer" underline="hover" data-testid="about-website">{SUPPORT.website}</Link></Row>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          When you write in, please mention the version above and what you were doing on the screen.
        </Typography>
      </Paper>
    </Box>
  );
}
