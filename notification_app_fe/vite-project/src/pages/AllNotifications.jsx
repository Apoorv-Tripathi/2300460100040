import React, { useState, useEffect, useRef } from "react";
import {
  Container, Typography, Box, CircularProgress,
  Alert, FormControl, InputLabel, Select, MenuItem, Pagination,
} from "@mui/material";
import NotificationCard from "../components/NotificationCard";
import { useNotifications } from "../hooks/useNotifications";

const PAGE_SIZE = 10;

export default function AllNotifications() {
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error } = useNotifications({
    notification_type: typeFilter,
    limit: 100,
  });

  // track which IDs were "new" on first load this session
  const seenRef = useRef(new Set());
  useEffect(() => {
    if (data.length && seenRef.current.size === 0) {
      // first load — mark nothing as new so user sees "new" badge on fresh ones
    }
  }, [data]);

  const paginated = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(data.length / PAGE_SIZE);

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h5" fontWeight={600}>
          All Notifications
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            ({data.length} total)
          </Typography>
        </Typography>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Filter by type</InputLabel>
          <Select
            value={typeFilter}
            label="Filter by type"
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          >
            <MenuItem value="">All types</MenuItem>
            <MenuItem value="Placement">Placement</MenuItem>
            <MenuItem value="Result">Result</MenuItem>
            <MenuItem value="Event">Event</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {loading && <Box sx={{ textAlign: "center", mt: 6 }}><CircularProgress /></Box>}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && data.length === 0 && (
        <Alert severity="info">No notifications found.</Alert>
      )}

      {paginated.map((n, i) => (
        <NotificationCard
          key={n.ID}
          notification={n}
          isNew={i < 3 && page === 1} // first 3 on page 1 treated as "new"
        />
      ))}

      {totalPages > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
          <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
        </Box>
      )}
    </Container>
  );
}