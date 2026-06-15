import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import LoginPage from "./auth/LoginPage";
import InvitePage from "./auth/InvitePage";
import AdminHome from "./auth/AdminHome";
import ProtectedRoute from "./auth/ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/admin/login", element: <LoginPage /> },
  { path: "/admin/invite/:token", element: <InvitePage /> },
  {
    path: "/admin",
    element: (
      <ProtectedRoute>
        <AdminHome />
      </ProtectedRoute>
    ),
  },
]);
