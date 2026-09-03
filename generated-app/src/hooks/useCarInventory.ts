import { useCallback } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { ADD_CAR, GET_CAR, GET_CARS } from "@/graphql/queries";
import type { Car } from "@/types";

/**
 * Single data-access module for the car inventory.
 *
 * Every GraphQL operation the app performs lives here: components consume these
 * hooks and never talk to Apollo directly.
 */

/** Result of {@link useCars} — the full car inventory list. */
export interface UseCarsResult {
  /** All cars in the inventory; empty array while loading or on error. */
  cars: Car[];
  /** True while the GET_CARS query is in flight. */
  loading: boolean;
  /** Populated when the GET_CARS query fails. */
  error?: Error;
}

/** Shape of the GET_CARS response. */
interface GetCarsData {
  cars: Car[];
}

/**
 * Fetches the full car inventory.
 *
 * Wraps the {@link GET_CARS} query document.
 */
export function useCars(): UseCarsResult {
  const { data, loading, error } = useQuery<GetCarsData>(GET_CARS);

  return {
    cars: data?.cars ?? [],
    loading,
    ...(error ? { error: error as Error } : {}),
  };
}

/** Result of {@link useCar} — a single car looked up by id. */
export interface UseCarResult {
  /** The requested car, or `null` while loading / when not found. */
  car: Car | null;
  /** True while the GET_CAR query is in flight. */
  loading: boolean;
  /** Populated when the GET_CAR query fails. */
  error?: Error;
}

/** Shape of the GET_CAR response. */
interface GetCarData {
  car: Car | null;
}

/** Variables accepted by the GET_CAR query. */
interface GetCarVariables {
  id: string;
}

/**
 * Fetches a single car by id.
 *
 * Wraps the {@link GET_CAR} query document and always issues the query for the
 * supplied `id` (`network-only`) so the detail view reflects the API rather
 * than a partially populated list entry sitting in the cache.
 */
export function useCar(id: string): UseCarResult {
  const { data, loading, error } = useQuery<GetCarData, GetCarVariables>(
    GET_CAR,
    {
      variables: { id },
      fetchPolicy: "network-only",
    }
  );

  return {
    car: error ? null : data?.car ?? null,
    loading,
    ...(error ? { error: error as Error } : {}),
  };
}

/** Variables accepted by {@link UseAddCarResult.addCar}. */
export interface UseAddCarInput {
  make: string;
  model: string;
  year: number;
  color: string;
}

/** Shape of the ADD_CAR response. */
interface AddCarData {
  addCar: Car | null;
}

/** Result of {@link useAddCar} — the mutation trigger plus request state. */
export interface UseAddCarResult {
  /**
   * Creates a car and resolves with the newly created record, or `null` when
   * the mutation fails or returns no data. The cars list is refreshed so the
   * new car appears without a page reload.
   */
  addCar: (input: UseAddCarInput) => Promise<Car | null>;
  /** True while the ADD_CAR mutation is in flight. */
  loading: boolean;
  /** Populated when the ADD_CAR mutation fails. */
  error?: Error;
}

/**
 * Adds a car to the inventory.
 *
 * Wraps the {@link ADD_CAR} mutation document and refetches {@link GET_CARS}
 * so the gallery stays in sync without a reload.
 */
export function useAddCar(): UseAddCarResult {
  const [mutate, { loading, error }] = useMutation<
    AddCarData,
    UseAddCarInput
  >(ADD_CAR, {
    refetchQueries: [{ query: GET_CARS }],
  });

  const addCar = useCallback(
    async (input: UseAddCarInput): Promise<Car | null> => {
      try {
        const result = await mutate({ variables: input });
        return result.data?.addCar ?? null;
      } catch {
        // The failure is surfaced through the `error` field below; callers get
        // `null` so they never have to handle a rejected promise.
        return null;
      }
    },
    [mutate]
  );

  return {
    addCar,
    loading,
    ...(error ? { error: error as Error } : {}),
  };
}