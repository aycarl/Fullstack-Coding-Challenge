import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { ADD_CAR, GET_CARS } from "@/graphql/queries";
import type { Car } from "@/types";

/**
 * Contract for the shared car inventory hook.
 *
 * Backed by the `GET_CARS` query and the `ADD_CAR` mutation defined in
 * `@/graphql/queries`.
 *
 * - `cars`   — the current inventory (empty array while loading or on error)
 * - `loading` — true while the initial `GetCars` query is in flight
 * - `error`  — populated when the `GetCars` query fails
 * - `addCar` — creates a new car and refreshes the inventory
 * - `adding` — true while an `AddCar` mutation is in flight
 */
export interface UseCarsResult {
  cars: Car[];
  loading: boolean;
  error?: Error;
  addCar: (input: {
    make: string;
    model: string;
    year: number;
    color: string;
  }) => Promise<void>;
  adding: boolean;
}

/**
 * Data shape returned by the `GetCars` query document.
 */
export interface GetCarsData {
  cars: Car[];
}

/**
 * Data shape returned by the `AddCar` mutation document.
 */
export interface AddCarData {
  addCar: Car;
}

/**
 * Variables accepted by the `AddCar` mutation document.
 */
export interface AddCarVariables {
  make: string;
  model: string;
  year: number;
  color: string;
}

const EMPTY_CARS: Car[] = [];

/**
 * Reads the car inventory and exposes a way to add new cars.
 *
 * The single owner of all inventory GraphQL access: components consume this
 * hook rather than issuing their own queries or mutations.
 */
export function useCars(): UseCarsResult {
  const { data, loading, error } = useQuery<GetCarsData>(GET_CARS);

  const [runAddCar, { loading: adding }] = useMutation<
    AddCarData,
    AddCarVariables
  >(ADD_CAR, {
    // Keep the `GetCars` result in the Apollo cache in sync so every consumer
    // of this hook sees the new car without a refetch or a page reload.
    update(cache, result) {
      const created = result.data?.addCar;
      if (!created) return;

      let existing: GetCarsData | null = null;
      try {
        existing = cache.readQuery<GetCarsData>({ query: GET_CARS });
      } catch {
        existing = null;
      }

      if (!existing || !Array.isArray(existing.cars)) return;
      if (existing.cars.some((car) => car.id === created.id)) return;

      cache.writeQuery<GetCarsData>({
        query: GET_CARS,
        data: { cars: [...existing.cars, created] },
      });
    },
  });

  const addCar = useCallback(
    async (input: {
      make: string;
      model: string;
      year: number;
      color: string;
    }): Promise<void> => {
      await runAddCar({
        variables: {
          make: input.make,
          model: input.model,
          year: Number(input.year),
          color: input.color,
        },
      });
    },
    [runAddCar]
  );

  const cars = useMemo<Car[]>(() => {
    if (error) return EMPTY_CARS;
    return data?.cars ?? EMPTY_CARS;
  }, [data, error]);

  return {
    cars,
    loading,
    error: error ?? undefined,
    addCar,
    adding,
  };
}

export default useCars;