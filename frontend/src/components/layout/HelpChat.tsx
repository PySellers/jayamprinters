import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Box, Button, Chip, Fab, IconButton, InputBase, Paper, Stack, Typography } from '@mui/material';
import ChatIcon from '@mui/icons-material/ChatBubbleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { assistantApi } from '../../api/extraApi';
import type { AssistantAnswer } from '../../api/extraApi';

interface Msg {
  from: 'me' | 'bot';
  text: string;
  link?: string;
  sources?: { title: string; link: string }[];
}

const FIRST: Msg = {
  from: 'bot',
  text: 'Hello! I am the help assistant of this software. Ask me how to do anything - for example "how do I add an advance payment?" or "how do I assign a task to an employee?".',
};
const SUGGESTIONS = [
  'How do I take an order?',
  'How do I add an advance payment?',
  'How do I print the job card?',
  'How do I add a new binding option?',
  'How do I see the live jobs?',
];

/**
 * The help chat in the bottom right corner of every page. It answers from the manual (backend/app/knowledge/manual.md), inside
 * the application - no outside AI service. Update that file when the software changes and the chat knows the new way.
 */
export default function HelpChat() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Msg[]>([FIRST]);
  const end = useRef<HTMLDivElement>(null);
  const topics = useQuery({ queryKey: ['assistant-topics'], queryFn: assistantApi.topics, enabled: open, staleTime: 600_000 });

  const ask = useMutation({
    mutationFn: (q: string) => assistantApi.ask(q),
    onSuccess: (a: AssistantAnswer) => setMessages((m) => [...m, { from: 'bot', text: a.answer, link: a.link || undefined, sources: a.sources }]),
    onError: () => setMessages((m) => [...m, { from: 'bot', text: 'Sorry, I could not answer just now. Please try again, or contact support: contact@pysellers.in, 8838587824.' }]),
  });

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, ask.isPending, open]);

  const send = (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    setMessages((m) => [...m, { from: 'me', text: question }]);
    setText('');
    ask.mutate(question);
  };
  const goTo = (link: string) => { setOpen(false); navigate(link); };
  const askTopic = (title: string) => send(title);

  return (
    <>
      {open && (
        <Paper
          elevation={8} role="dialog" aria-label="Help chat" data-testid="help-chat"
          sx={{
            position: 'fixed', right: { xs: 8, sm: 20 }, bottom: { xs: 70, sm: 84 }, zIndex: 1400, width: { xs: 'calc(100vw - 16px)', sm: 380 }, maxWidth: 420,
            height: { xs: '70vh', sm: 520 }, maxHeight: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column', borderRadius: 3, overflow: 'hidden',
          }}
        >
          <Box sx={{ bgcolor: '#1a237e', color: '#fff', px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmartToyIcon fontSize="small" />
            <Box sx={{ flexGrow: 1 }}>
              <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>Help assistant</Typography>
              <Typography sx={{ fontSize: 11, opacity: 0.85 }}>Answers from the user manual</Typography>
            </Box>
            <IconButton size="small" sx={{ color: '#fff' }} aria-label="Close help" onClick={() => setOpen(false)}><CloseIcon fontSize="small" /></IconButton>
          </Box>
          <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 1.5, bgcolor: '#f6f8fc' }} data-testid="chat-messages">
            <Stack spacing={1}>
              {messages.map((m, i) => (
                <Box key={i} sx={{ alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '88%' }} data-testid={m.from === 'me' ? 'chat-me' : 'chat-bot'}>
                  <Paper elevation={0} sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: m.from === 'me' ? '#1a237e' : '#fff', color: m.from === 'me' ? '#fff' : 'text.primary', border: m.from === 'me' ? 'none' : '1px solid #dfe4f1' }}>
                    {m.text.split('\n').map((line, k) => (
                      <Typography key={k} variant="body2" sx={{ fontWeight: m.from === 'bot' && k === 0 && m.link ? 800 : 400, whiteSpace: 'pre-wrap' }}>{line}</Typography>
                    ))}
                    {m.link && (
                      <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={() => goTo(m.link!)} data-testid="chat-open-page">Open that page</Button>
                    )}
                  </Paper>
                  {m.sources && m.sources.length > 0 && (
                    <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>Related:</Typography>
                      {m.sources.map((s) => <Chip key={s.title} size="small" variant="outlined" label={s.title} onClick={() => askTopic(s.title)} />)}
                    </Box>
                  )}
                </Box>
              ))}
              {ask.isPending && <Typography variant="caption" color="text.secondary">Looking in the manual…</Typography>}
              {messages.length === 1 && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {SUGGESTIONS.map((s) => <Chip key={s} size="small" color="primary" variant="outlined" label={s} onClick={() => send(s)} />)}
                  {(topics.data ?? []).length > 0 && <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mt: 0.5 }}>I know {(topics.data ?? []).length} topics.</Typography>}
                </Box>
              )}
              <div ref={end} />
            </Stack>
          </Box>
          <Box component="form" onSubmit={(e) => { e.preventDefault(); send(text); }} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderTop: '1px solid #dfe4f1', bgcolor: '#fff' }}>
            <InputBase
              fullWidth placeholder="Type your question…" value={text} onChange={(e) => setText(e.target.value)} sx={{ px: 1, fontSize: 14 }}
              slotProps={{ input: { "aria-label": "Your question", maxLength: 300, "data-testid": "chat-input" } as object }}
            />
            <IconButton type="submit" color="primary" disabled={!text.trim() || ask.isPending} aria-label="Send question" data-testid="chat-send"><SendIcon /></IconButton>
          </Box>
        </Paper>
      )}
      <Fab
        color="primary" aria-label={open ? 'Close help chat' : 'Open help chat'} data-testid="help-fab" onClick={() => setOpen((o) => !o)}
        sx={{ position: 'fixed', right: { xs: 12, sm: 20 }, bottom: { xs: 44, sm: 46 }, zIndex: 1400, bgcolor: '#1a237e', '&:hover': { bgcolor: '#0d145e' } }}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </Fab>
    </>
  );
}
