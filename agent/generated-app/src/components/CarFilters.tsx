import type { ChangeEvent } from "react";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import type { SortBy } from "@/hooks/useCarFilters";

export interface CarFiltersProps {
  /** Current model search term. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Currently selected model year, or "" for all years. */
  year: string;
  onYearChange: (value: string) => void;
  /** Currently selected sort field. */
  sortBy: SortBy;
  onSortByChange: (value: SortBy) => void;
  /** Distinct model years available for filtering. */
  years: readonly number[];
  onClear: () => void;
}

/**
 * Fully controlled filter bar for the inventory gallery.
 *
 * The free-text field is labelled simply "Search" on purpose: the add-car form
 * renders its own "Model" text box on the same screen, so a label such as
 * "Search by model" would make the two fields indistinguishable to assistive
 * technology (and to role/name based queries).
 */
export default function CarFilters({
  search,
  onSearchChange,
  year,
  onYearChange,
  sortBy,
  onSortByChange,
  years,
  onClear,
}: CarFiltersProps) {
  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  const handleYear = (event: SelectChangeEvent) => {
    onYearChange(event.target.value);
  };

  const handleSortBy = (event: SelectChangeEvent) => {
    onSortByChange(event.target.value as SortBy);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        alignItems: "center",
        mb: 3,
      }}
    >
      <TextField
        label="Search"
        value={search}
        onChange={handleSearch}
        size="small"
        sx={{ minWidth: 220 }}
      />

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="car-filters-year-label">Year</InputLabel>
        <Select
          labelId="car-filters-year-label"
          label="Year"
          value={year}
          onChange={handleYear}
        >
          <MenuItem value="">All years</MenuItem>
          {years.map((option) => (
            <MenuItem key={option} value={String(option)}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="car-filters-sort-label">Sort by</InputLabel>
        <Select
          labelId="car-filters-sort-label"
          label="Sort by"
          value={sortBy}
          onChange={handleSortBy}
        >
          <MenuItem value="year">Year</MenuItem>
          <MenuItem value="make">Make</MenuItem>
        </Select>
      </FormControl>

      <Button variant="outlined" onClick={onClear}>
        Clear filters
      </Button>
    </Box>
  );
}
