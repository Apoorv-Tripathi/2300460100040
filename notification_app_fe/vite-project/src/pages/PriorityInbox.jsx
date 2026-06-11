import React, { useState } from "react";
import {
  Container, Typography, Box, CircularProgress,
  Alert, Slider, Chip,
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import NotificationCard from "../components/NotificationCard";
import { useNotifications } from "../hooks/useNotifications";
import { getTopN } from "../utils/priority";

export default function PriorityInbox() {
  const [topN, setTopN] = useState(10);
  const [typeFilter, setTypeFilter] = useState("");
  const { data, loading, error } = useNotifications({ notification_type: typeFilter });

  const prioritized = getTopN(data, topN);

  const types = ["Placement", "Result", "Event"];

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <StarIcon color="warning" />
        <Typography variant="h5" fontWeight={600}>Priority Inbox</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Ranked by type weight (Placement &gt; Result &gt; Event) × recency
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: 3, mb: 3, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 220 }}>
          <Typography variant="body2" gutterBottom>
            Show top <strong>{topN}</strong> notifications
          </Typography>
          <Slider
            value={topN}
            min={5} max={20} step={5}
            marks={[{value:5,label:"5"},{value:10,label:"10"},{value:15,label:"15"},{value:20,label:"20"}]}
            onChange={(_, v) => setTopN(v)}
            color="primary"
          />
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {types.map(t => (
            <Chip
              key={t}
              label={t}
              onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
              color={typeFilter === t ? "primary" : "default"}
              variant={typeFilter === t ? "filled" : "outlined"}
              clickable
            />
          ))}
        </Box>
      </Box>

      {loading && <Box sx={{ textAlign: "center", mt: 6 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && prioritized.length === 0 && (
        <Alert severity="info">No notifications to show.</Alert>
      )}

      {prioritized.map((n, i) => (
        <Box key={n.ID} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
          <Typography
            variant="body2"
            sx={{ mt: 2, minWidth: 24, fontWeight: 600, color: i < 3 ? "#f59e0b" : "text.secondary" }}
          >
            #{i + 1}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <NotificationCard notification={n} isNew={true} />
          </Box>
        </Box>
      ))}
    </Container>
  );
}