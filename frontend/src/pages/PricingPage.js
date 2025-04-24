import React from 'react';
import { useNavigate } from 'react-router-dom'; // If using React Router for potential redirects later
// Use axios directly
import axios from 'axios'; 
import { 
    Container, 
    Typography, 
    Grid, 
    Card, 
    CardContent, 
    CardActions, 
    Button, 
    List, 
    ListItem, 
    ListItemIcon, 
    ListItemText, 
    CircularProgress, 
    Box 
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import StarIcon from '@mui/icons-material/Star'; // Example for highlighting
// import './PricingPage.css'; // We'll need to create and import styles

// Get Base URL from AuthContext or environment variable
let API_BASE_URL = process.env.REACT_APP_API_URL;
if (!API_BASE_URL) {
    API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
}
API_BASE_URL = API_BASE_URL.replace(/["|']/g, '');
API_BASE_URL = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

// Get Price IDs from environment variables (set in Netlify UI for production)
const proMonthlyPriceId = process.env.REACT_APP_STRIPE_PRO_MONTHLY_PRICE_ID;
const proYearlyPriceId = process.env.REACT_APP_STRIPE_PRO_YEARLY_PRICE_ID;
const unlimitedMonthlyPriceId = process.env.REACT_APP_STRIPE_UNLIMITED_MONTHLY_PRICE_ID; // TODO: Replace with NEW $9 Price ID env var
const unlimitedYearlyPriceId = process.env.REACT_APP_STRIPE_UNLIMITED_YEARLY_PRICE_ID;   // TODO: Replace with NEW $90 Price ID env var


function PricingPage() {
    const navigate = useNavigate(); // Optional: for navigating after success/cancel if needed
    const [isLoading, setIsLoading] = React.useState(null); // Track loading state per button type (monthly/yearly)

    const handleUpgrade = async (priceId, planType) => {
        if (!priceId) {
            console.error("Stripe Price ID is missing. Check environment variables.");
            alert("Sorry, there was an issue initiating the upgrade. Please contact support.");
            return;
        }
        setIsLoading(planType); // Indicate loading for the specific button type clicked
        console.log(`Attempting upgrade with Price ID: ${priceId}`);
        try {
            // Use axios directly. Assumes token header is set globally in AuthContext
            const response = await axios.post(`${API_BASE_URL}/api/create-checkout-session`, { priceId });

            if (response && response.data && response.data.url) {
                // Redirect the user to Stripe Checkout
                window.location.href = response.data.url;
                // Don't reset isLoading here as the page will navigate away
            } else {
                console.error('Failed to get checkout URL from backend:', response);
                alert("Failed to start the upgrade process. Please try again later.");
                setIsLoading(null); // Reset loading state on failure
            }
        } catch (error) {
            console.error("Error creating checkout session:", error);
            const errorMsg = error.response?.data?.error || "An error occurred. Please try again.";
            alert(`Error: ${errorMsg}`);
            setIsLoading(null); // Reset loading state on error
        }
    };

    const renderUpgradeButtons = (monthlyId, yearlyId, monthlyKey, yearlyKey) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
            <Button 
                variant="contained" 
                color="primary" 
                onClick={() => handleUpgrade(monthlyId, monthlyKey)} 
                disabled={isLoading === monthlyKey}
            >
                {isLoading === monthlyKey ? <CircularProgress size={24} /> : 'Upgrade Monthly'}
            </Button>
            <Button 
                variant="outlined" 
                color="primary" 
                onClick={() => handleUpgrade(yearlyId, yearlyKey)} 
                disabled={isLoading === yearlyKey}
            >
                 {isLoading === yearlyKey ? <CircularProgress size={24} /> : 'Upgrade Yearly'}
            </Button>
        </Box>
    );

    const planFeatures = {
        free: [
            "Up to 10 Parts",
            "Up to 1 Journal Entry / day",
            "Up to 10 Guided Session Messages / day",
            "Standard AI Model Access"
        ],
        pro: [
            "Up to 20 Parts",
            "Up to 10 Journal Entries / day",
            "Up to 30 Guided Session Messages / day",
            "Standard & Enhanced AI Models",
            "Priority Support"
        ],
        unlimited: [
            "Unlimited Parts",
            "Unlimited Journal Entries / day",
            "Unlimited Guided Session Messages / day",
            "Access to All AI Models (incl. Frontier)",
            "Highest Priority Support"
        ]
    };

    const renderFeatures = (features) => (
        <List dense sx={{ pt: 0, pb: 0 }}>
            {features.map((feature, index) => (
                <ListItem key={index} disableGutters sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 'auto', mr: 1, color: 'success.main' }}>
                        <CheckIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={feature} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItem>
            ))}
        </List>
    );

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom align="center">
                Choose Your Plan
            </Typography>

            <Typography variant="body1" color="text.secondary" align="center" sx={{ maxWidth: '700px', margin: '0 auto 30px auto' }}>
                Our free plan offers a great way to get started with IFS Center.
                To provide unlimited access and support features like extended AI-guided sessions,
                we offer paid subscriptions. These help cover the real costs associated with
                powerful AI models (LLM API calls), database storage, and hosting, allowing us
                to maintain and improve the service. We appreciate your support!
            </Typography>

            <Grid container spacing={3} justifyContent="center" alignItems="stretch">
                {/* Free Tier Card */}
                <Grid item xs={12} sm={6} md={4}>
                    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <CardContent sx={{ flexGrow: 1 }}>
                            <Typography variant="h5" component="h2" gutterBottom align="center">Free</Typography>
                            <Typography variant="h4" component="p" align="center" gutterBottom>$0<Typography component="span" variant="body1" color="text.secondary">/month</Typography></Typography>
                            {renderFeatures(planFeatures.free)}
                        </CardContent>
                        <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
                            <Button variant="outlined" disabled>Current Plan</Button>
                        </CardActions>
                    </Card>
                </Grid>

                {/* Pro Tier Card */}
                <Grid item xs={12} sm={6} md={4}>
                    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', border: '2px solid', borderColor: 'primary.main' }}>
                        {/* Optional: Add a Chip or Badge for "Recommended" */}
                        <CardContent sx={{ flexGrow: 1 }}>
                            <Typography variant="h5" component="h2" gutterBottom align="center" color="primary">Pro</Typography>
                            <Typography variant="h4" component="p" align="center">$5<Typography component="span" variant="body1" color="text.secondary">/month</Typography></Typography>
                            <Typography variant="body2" color="text.secondary" align="center" gutterBottom>
                                or $50/year <Typography component="span" sx={{ color: 'success.main', fontWeight: 'bold' }}>(Save 2 months!)</Typography>
                            </Typography>
                            {renderFeatures(planFeatures.pro)}
                        </CardContent>
                        <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
                             {renderUpgradeButtons(proMonthlyPriceId, proYearlyPriceId, 'proMonthly', 'proYearly')}
                        </CardActions>
                    </Card>
                </Grid>

                {/* Unlimited Tier Card */}
                 <Grid item xs={12} sm={6} md={4}>
                    <Card sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid transparent',
                        boxShadow: '0px 0px 15px 5px rgba(25, 118, 210, 0.3)',
                        borderRadius: '4px'
                    }}>
                        <CardContent sx={{ flexGrow: 1 }}>
                            <Typography variant="h5" component="h2" gutterBottom align="center" sx={{ color: 'secondary.main' }}>Unlimited</Typography> 
                            <Typography variant="h4" component="p" align="center">$9<Typography component="span" variant="body1" color="text.secondary">/month</Typography></Typography>
                             <Typography variant="body2" color="text.secondary" align="center" gutterBottom>
                                or $90/year <Typography component="span" sx={{ color: 'success.main', fontWeight: 'bold' }}>(Save 2 months!)</Typography>
                            </Typography>
                            {renderFeatures(planFeatures.unlimited)}
                        </CardContent>
                        <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
                             {renderUpgradeButtons(unlimitedMonthlyPriceId, unlimitedYearlyPriceId, 'unlimitedMonthly', 'unlimitedYearly')}
                        </CardActions>
                    </Card>
                </Grid>
            </Grid>
        </Container>
    );
}

export default PricingPage; 