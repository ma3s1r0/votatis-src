import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import LoginPage from "./auth/LoginPage";
import InvitePage from "./auth/InvitePage";
import QueuePage from "./auth/QueuePage";
import ReportDetailPage from "./auth/ReportDetailPage";
import ProtectedRoute from "./auth/ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/admin/login", element: <LoginPage /> },
  { path: "/admin/invite/:token", element: <InvitePage /> },
  {
    path: "/admin",
    element: (
      <ProtectedRoute>
        <QueuePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin/queue",
    element: (
      <ProtectedRoute>
        <QueuePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin/reports/:id",
    element: (
      <ProtectedRoute>
        <ReportDetailPage />
      </ProtectedRoute>
    ),
  },
]);
