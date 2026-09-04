import { useState } from "react";
import { Container, Typography } from "@mui/material";
import AddCarForm from "@/components/AddCarForm";
import CarList from "@/components/CarList";
import CarDetail from "@/components/CarDetail";

/**
 * Application shell.
 *
 * Owns the only piece of app-level state — the id of the car currently being
 * inspected. When nothing is selected the gallery view is shown (heading, the
 * add-car form and the filterable inventory list); selecting a card swaps the
 * whole view for the single-car record, whose back control clears the
 * selection and returns to the gallery.
 *
 * This module performs no GraphQL work itself: every request is made by the
 * components and hooks it composes.
 */
export default function App() {
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);

  if (selectedCarId !== null) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <CarDetail id={selectedCarId} onBack={() => setSelectedCarId(null)} />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Car Inventory Manager
      </Typography>

      <AddCarForm />

      <CarList onSelectCar={(id) => setSelectedCarId(id)} />
    </Container>
  );
}