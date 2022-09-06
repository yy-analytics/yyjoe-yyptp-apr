import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './theme';
import { Button, CssBaseline } from '@mui/material';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { getYyJoeAPR, getYyPTPAPR } from './utils';

function App() {
  const [yyJoeStats, setYyJoeStats] = React.useState({});
  const [yyPtpStats, setYyPtpStats] = React.useState({});

  React.useEffect(() => {
    handleRefreshAPRs();
  }, []);

  const handleRefreshAPRs = async () => {
    setYyJoeStats({});
    setYyPtpStats({});
    const newYyJoeStats = await getYyJoeAPR();
    setYyJoeStats(newYyJoeStats);
    const newYyPtpStats = await getYyPTPAPR();
    setYyPtpStats(newYyPtpStats);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl" sx={{
        height: '100vh',
        padding: "10px",
      }}>
        <Grid container alignItems="center" spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h3">
              APR calculation for yyJOE & yyPTP
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <Button variant="contained" onClick={handleRefreshAPRs}>
              Refresh
            </Button>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="h6">
              As of block: {yyJoeStats.latestBlock || "loading..."}
            </Typography>
            <Typography variant="h6">
              yyJOE APR = {yyJoeStats.yyJoeAPRWithDiscount || "loading..."} with discount
            </Typography>
            <Typography variant="h6">
              yyJOE APR = {yyJoeStats.yyJoeAPR || "loading..."} without discount
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="h6">
              As of block: {yyPtpStats.latestBlock || "loading..."}
            </Typography>
            <Typography variant="h6">
              yyPTP APR = {yyPtpStats.yyPTPAPRWithDiscount || "loading..."} with discount
            </Typography>
            <Typography variant="h6">
              yyPTP APR = {yyPtpStats.yyPTPAPR || "loading..."} without discount
            </Typography>
          </Grid>
        </Grid>
      </Container >
    </ThemeProvider >
  );
}

export default App;
