import React from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  useMediaQuery,
  useTheme,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  ListItemIcon,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useAuth } from '../context/AuthContext';

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [logoutDialogOpen, setLogoutDialogOpen] = React.useState(false);
  const { isAuthenticated, logout } = useAuth();
  
  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  
  const handleMenuClose = () => {
    setAnchorEl(null);
  };
  
  const handleLogoutClick = () => {
    setLogoutDialogOpen(true);
  };

  const handleLogoutCancel = () => {
    setLogoutDialogOpen(false);
  };

  const handleLogoutConfirm = () => {
    setLogoutDialogOpen(false);
    logout();
    if (anchorEl) {
      handleMenuClose();
    }
  };
  
  const isActive = (path) => location.pathname === path;
  
  // Handle navigation with prompt preservation
  const handleNavigation = (path) => {
    if (path === '/journal') {
      // Get the current prompt from localStorage
      const currentPrompt = localStorage.getItem('currentJournalPrompt');
      navigate(path, { state: { selectedPrompt: currentPrompt } });
      if (anchorEl) {
        handleMenuClose();
      }
    } else {
      navigate(path);
      if (anchorEl) {
        handleMenuClose();
      }
    }
  };
  
  // Add Pricing and Account Settings to navItems for logged-in users
  const navItems = isAuthenticated ? [
    { label: 'Dashboard', path: '/', icon: null },
    { label: 'Parts', path: '/parts', icon: null },
    { label: 'System Map', path: '/system-map', icon: null },
    { label: 'Guided Sessions', path: '/sessions', icon: null },
    { label: 'Journal', path: '/journal', icon: null },
    { label: 'About IFS', path: '/about-ifs', icon: null },
    { label: 'Pricing', path: '/pricing', icon: null },
  ] : [];

  // Account Settings specific item (might be better as an Icon Button)
  const accountSettingsItem = { label: 'Account', path: '/account-settings', icon: <AccountCircleIcon /> };
  
  return (
    <AppBar position="static">
      <Container maxWidth="lg">
        <Toolbar disableGutters>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{
              mr: 2,
              fontWeight: 700,
              color: 'white',
              textDecoration: 'none',
            }}
          >
            IFS Center
          </Typography>
          
          <Box sx={{ flexGrow: 1 }} />
          
          {isAuthenticated ? (
            <>
              {isMobile ? (
                <>
                  <IconButton
                    color="inherit"
                    aria-label="menu"
                    onClick={handleMenuClick}
                    edge="end"
                  >
                    <MenuIcon />
                  </IconButton>
                  <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                  >
                    {navItems.map((item) => (
                      <MenuItem
                        key={item.path}
                        onClick={() => handleNavigation(item.path)}
                        selected={isActive(item.path)}
                      >
                        {item.label}
                      </MenuItem>
                    ))}
                    {/* Add Account Settings to mobile menu - removing icon */}
                     <MenuItem
                        key={accountSettingsItem.path}
                        onClick={() => handleNavigation(accountSettingsItem.path)}
                        selected={isActive(accountSettingsItem.path)}
                     >
                         {/* Removed <ListItemIcon> */} 
                         {accountSettingsItem.label}
                     </MenuItem>
                     <MenuItem onClick={handleLogoutClick}>
                        Logout
                     </MenuItem>
                  </Menu>
                </>
              ) : (
                <>
                  <Box sx={{ display: 'flex' }}>
                    {navItems.map((item) => (
                      <Button
                        key={item.path}
                        onClick={() => handleNavigation(item.path)}
                        sx={{
                          mx: 1,
                          color: 'white',
                          fontWeight: isActive(item.path) ? 'bold' : 'normal',
                          borderBottom: isActive(item.path) ? '2px solid white' : 'none',
                        }}
                      >
                        {item.label}
                      </Button>
                    ))}
                    {/* Add Account Settings Icon Button for Desktop */}
                     <IconButton
                       color="inherit"
                       onClick={() => handleNavigation(accountSettingsItem.path)}
                       title="Account Settings"
                       sx={{ ml: 1 }}
                     >
                       {accountSettingsItem.icon}
                     </IconButton>
                  </Box>
                  <Button 
                    color="inherit" 
                    onClick={handleLogoutClick}
                    sx={{ ml: 1 }}
                  >
                    Logout
                  </Button>
                </>
              )}
              
              {/* Logout Confirmation Dialog */}
              <Dialog
                open={logoutDialogOpen}
                onClose={handleLogoutCancel}
                aria-labelledby="logout-dialog-title"
                aria-describedby="logout-dialog-description"
              >
                <DialogTitle id="logout-dialog-title">
                  Confirm Logout
                </DialogTitle>
                <DialogContent>
                  <DialogContentText id="logout-dialog-description">
                    Are you sure you want to log out?
                  </DialogContentText>
                </DialogContent>
                <DialogActions>
                  <Button onClick={handleLogoutCancel} color="primary">
                    Cancel
                  </Button>
                  <Button onClick={handleLogoutConfirm} color="primary" autoFocus>
                    Logout
                  </Button>
                </DialogActions>
              </Dialog>
            </>
          ) : (
            <>
            {isMobile ? (
              <>
                <IconButton
                  color="inherit"
                  aria-label="menu"
                  onClick={handleMenuClick}
                  edge="start"
                >
                  <MenuIcon />
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuClose}
                >
                  <MenuItem onClick={() => handleNavigation('/about-ifs')} selected={isActive('/about-ifs')}>About IFS</MenuItem>
                  <MenuItem onClick={() => handleNavigation('/pricing')} selected={isActive('/pricing')}>Pricing</MenuItem>
                </Menu>
                <Box sx={{ flexGrow: 1 }} />
                {!isActive('/login') && (
                  <Button
                    color="inherit"
                    component={RouterLink}
                    to="/login"
                    size="small"
                  >
                    Login
                  </Button>
                )}
                {!isActive('/register') && (
                  <Button
                    color="inherit"
                    component={RouterLink}
                    to="/register"
                    size="small"
                  >
                    Register
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  color="inherit"
                  component={RouterLink}
                  to="/about-ifs"
                  sx={{ display: isActive('/about-ifs') ? 'none' : 'block' }}
                >
                  About IFS
                </Button>
                <Button
                  color="inherit"
                  component={RouterLink}
                  to="/pricing"
                  sx={{ display: isActive('/pricing') ? 'none' : 'block' }}
                >
                  Pricing
                </Button>
                {!isActive('/login') && (
                  <Button
                    color="inherit"
                    component={RouterLink}
                    to="/login"
                  >
                    Login
                  </Button>
                )}
                {!isActive('/register') && (
                  <Button
                    color="inherit"
                    component={RouterLink}
                    to="/register"
                  >
                    Register
                  </Button>
                )}
              </>
            )}
            </>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );
};

export default Navigation; 