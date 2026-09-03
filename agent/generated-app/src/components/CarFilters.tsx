import { Box, MenuItem, TextField } from "@mui/material";
import type { SortBy } from "@/utils/filterAndSortCars";

export interface CarFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: SortBy;
  onSortByChange: (value: SortBy) => void;
}

/**
 * Fully controlled presentational filter bar.
 *
 * - A labelled search textbox reporting every keystroke via `onSearchChange`.
 * - A labelled select offering "Year" and "Make", reporting the chosen value
 *   via `onSortByChange`.
 *
 * The component holds no state of its own: what it renders is exactly what the
 * parent passes in.
 */
export default function CarFilters({
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
}: CarFiltersProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        gap: 2,
        mb: 3,
      }}
    >
      <TextField
        label="Search by model"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        fullWidth
        slotProps={{ htmlInput: { "aria-label": "Search by model" } }}
      />
      <TextField
        select
        label="Sort by"
        value={sortBy}
        onChange={(event) => onSortByChange(event.target.value as SortBy)}
        sx={{ minWidth: { sm: 200 } }}
        fullWidth
      >
        <MenuItem value="year">Year</MenuItem>
        <MenuItem value="make">Make</MenuItem>
      </TextField>
    </Box>
  );
}