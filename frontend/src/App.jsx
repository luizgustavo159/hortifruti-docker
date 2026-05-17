import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./animations.css";
import { Login } from "./pages/Login";
import { Caixa } from "./pages/Caixa";
import { CaixaFocusMode } from "./pages/CaixaFocusMode";
import { CaixaFechamento } from "./pages/CaixaFechamento";
import { Estoque } from "./pages/Estoque";
import { Descontos } from "./pages/Descontos";
import { AdminDashboard } from "./pages/AdminDashboard";
import { DashboardAdvanced } from "./pages/DashboardAdvanced";
import { AdminLogs } from "./pages/AdminLogs";
import { AdminPerfil } from "./pages/AdminPerfil";
import { AdminPoliticas } from "./pages/AdminPoliticas";
import { AdminRelatorios } from "./pages/AdminRelatorios";
import { AdminFuncionarios } from "./pages/AdminFuncionarios";
import { AdminConfiguracao } from "./pages/AdminConfiguracao";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Toaster } from "sonner";

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: "24px" }}>Carregando sessão...</div>;
  }

  return (
    <Routes>
        <Route
          path="/"
          element={isAuthenticated ? <Navigate to="/caixa" replace /> : <Login />}
        />
        <Route
          path="/caixa"
          element={
            <ProtectedRoute>
              <Caixa />
            </ProtectedRoute>
          }
        />
        <Route
          path="/caixa/fechamento"
          element={
            <ProtectedRoute>
              <CaixaFechamento />
            </ProtectedRoute>
          }
        />
        <Route
          path="/caixa/focus"
          element={
            <ProtectedRoute>
              <CaixaFocusMode />
            </ProtectedRoute>
          }
        />
        <Route
          path="/estoque"
          element={
            <ProtectedRoute>
              <Estoque />
            </ProtectedRoute>
          }
        />
        <Route
          path="/descontos"
          element={
            <ProtectedRoute requiredRole="manager">
              <Descontos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/advanced"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardAdvanced />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/logs"
          element={
            <ProtectedRoute requiredRole="manager">
              <AdminLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/perfil"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminPerfil />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/politicas"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminPoliticas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/relatorios"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminRelatorios />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/funcionarios"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminFuncionarios />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/configuracao"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminConfiguracao />
            </ProtectedRoute>
          }
        />
      </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
