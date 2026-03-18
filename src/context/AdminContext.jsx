import React, { createContext, useContext, useState, useEffect } from "react";

const ADMIN_KEY = "adhyant_admin";
const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      setIsAdmin(sessionStorage.getItem(ADMIN_KEY) === "1");
    } catch (e) {
      setIsAdmin(false);
    }
  }, []);

  const loginAdmin = (user, password) => {
    const expectedUser = import.meta.env.VITE_ADMIN_USER || "admin";
    const expectedPass = import.meta.env.VITE_ADMIN_PASSWORD || "adhyant2025";
    if (user === expectedUser && password === expectedPass) {
      sessionStorage.setItem(ADMIN_KEY, "1");
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const logoutAdmin = () => {
    sessionStorage.removeItem(ADMIN_KEY);
    setIsAdmin(false);
  };

  return (
    <AdminContext.Provider value={{ isAdmin, loginAdmin, logoutAdmin }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  return ctx || { isAdmin: false, loginAdmin: () => false, logoutAdmin: () => {} };
}
