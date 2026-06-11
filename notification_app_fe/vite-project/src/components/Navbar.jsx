import React from "react";
import { AppBar, Toolbar, Typography, Button, Box } from "@mui/material";
import { NavLink } from "react-router-dom";
import NotificationsIcon from "@mui/icons-material/Notifications";
import StarIcon from "@mui/icons-material/Star";

export default function Navbar() {
  const linkStyle = ({ isActive }) => ({
    color: isActive ? "#fff" : "rgba(255,255,255,0.7)",
    textDecoration: "none",
    fontWeight: isActive ? 600 : 400,
  });

  return (
    <AppBar position="sticky" elevation={1}>
      <Toolbar sx={{ gap: 2 }}>
        <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
          CampusNotify
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            component={NavLink}
            to="/notifications"
            startIcon={<NotificationsIcon />}
            sx={{ color: "inherit" }}
            style={linkStyle}
          >
            All
          </Button>
          <Button
            component={NavLink}
            to="/priority"
            startIcon={<StarIcon />}
            sx={{ color: "inherit" }}
            style={linkStyle}
          >
            Priority Inbox
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}