import request from "supertest";
import { createApp } from "../src/app.js";

export const api = request(createApp());

export async function stats() {
  return (await api.get("/api/ontology/statistics")).body;
}
