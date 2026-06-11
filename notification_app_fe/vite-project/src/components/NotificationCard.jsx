import React from "react";
import { Card, CardContent, Typography, Chip, Box } from "@mui/material";

const TYPE_COLOR = {
  Placement: "success",
  Result: "warning",
  Event: "info",
};

export default function NotificationCard({ notification, isNew }) {
  const { Type, Message, Timestamp } = notification;
  const date = new Date(Timestamp).toLocaleString();

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.5,
        borderLeft: isNew ? "4px solid #1a73e8" : "4px solid transparent",
        backgroundColor: isNew ? "#f0f6ff" : "#fff",
        transition: "all 0.2s",
        "&:hover": { boxShadow: 3 },
      }}
    >
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body1" fontWeight={isNew ? 600 : 400}>
              {Message}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {date}
            </Typography>
          </Box>
          <Chip
            label={Type}
            color={TYPE_COLOR[Type] || "default"}
            size="small"
            variant={isNew ? "filled" : "outlined"}
          />
        </Box>
      </CardContent>
    </Card>
  );
}