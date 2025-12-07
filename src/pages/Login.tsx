import React, { useState } from "react";
import { api, setAuth } from "../api";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FiLogIn, FiMail, FiLock } from "react-icons/fi";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });
      toast.success("Inicio de sesión exitoso 🎉");

      localStorage.setItem("token", data.token);
      setAuth(data.token);

      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 800);

    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2 className="auth-title">Iniciar Sesión</h2>
        
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="input-group">
            <label className="input-label">Email</label>
            <div style={{ position: 'relative' }}>
              <FiMail style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }} />
              <input
                className="input-field"
                style={{ paddingLeft: '3rem' }}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <FiLock style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }} />
              <input
                className="input-field"
                style={{ paddingLeft: '3rem' }}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          </div>

          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div>
                <span>Iniciando sesión...</span>
              </div>
            ) : (
              <>
                <FiLogIn />
                <span>Iniciar Sesión</span>
              </>
            )}
          </button>
        </form>

        <p className="auth-link-text">
          ¿No tienes cuenta?{" "}
          <Link to="/register" className="auth-link">
            Regístrate aquí
          </Link>
        </p>
      </div>
    </div>
  );
}