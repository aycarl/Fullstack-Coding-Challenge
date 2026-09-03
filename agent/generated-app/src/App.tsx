import { useMemo, useState } from "react";
import { Container, Typography } from "@mui/material";
import AddCarForm from "@/components/AddCarForm";
import CarFilters from "@/components/CarFilters";
import CarList from "@/components/CarList";
import { useCars } from "@/hooks/useCars";
import { filterAndSortCars, type SortBy } from "@/utils/filterAndSortCars";

/**
 * Application shell.
 *
 * Owns the two pieces of view state the gallery needs — the model search text
 * and the sort field — and derives the visible list from the inventory returned
 * by `useCars()` via `filterAndSortCars`. All GraphQL access lives in the hook.
 */
export default function App() {
  const { cars, loading, error, addCar, adding } = useCars();

  const [search, setSearch] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("year");

  const visibleCars = useMemo(
    () => filterAndSortCars(cars, search, sortBy),
    [cars, search, sortBy]
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Car Inventory Manager
      </Typography>

      <AddCarForm onAdd={addCar} submitting={adding} />

      <CarFilters
        search={search}
        onSearchChange={setSearch}
        sortBy={sortBy}
        onSortByChange={setSortBy}
      />

      <CarList cars={visibleCars} loading={loading} error={error} />
    </Container>
  );
}