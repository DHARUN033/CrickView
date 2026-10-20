import axios, { type InternalAxiosRequestConfig } from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "/api/v1";

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("crickview_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
