import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import ReportWizard from "./report/ReportWizard";
import LoginPage from "./auth/LoginPage";
import InvitePage from "./auth/InvitePage";
import QueuePage from "./auth/QueuePage";
import ReportDetailPage from "./auth/ReportDetailPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import ArchiveListPage from "./archive/ArchiveListPage";
import ArchiveDetailPage from "./archive/ArchiveDetailPage";

export const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/report", element: <ReportWizard /> },
  { path: "/archive", element: <ArchiveListPage /> },
  { path: "/archive/:id", element: <ArchiveDetailPage /> },
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
