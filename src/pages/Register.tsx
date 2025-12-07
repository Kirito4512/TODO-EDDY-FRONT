import React, { useState } from "react";
import { api, setAuth } from "../api";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FiUser, FiMail, FiLock, FiUserPlus } from "react-icons/fi";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await api.post("/auth/register", {
        name,
        email,
        password,
      });

      toast.success("Cuenta creada con éxito 🎉");

      localStorage.setItem("token", data.token);
      setAuth(data.token);

      setTimeout(() => {
        navigate("/dashboard");
      }, 800);

    } catch (err: any) {
      const msg = err?.response?.data?.message || "Error al registrarse";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2 className="auth-title">Crear Cuenta</h2>
        
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="input-group">
            <label className="input-label">Nombre completo</label>
            <div style={{ position: 'relative' }}>
              <FiUser style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }} />
              <input
                className="input-field"
                style={{ paddingLeft: '3rem' }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre completo"
                required
                disabled={loading}
              />
            </div>
          </div>

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
                minLength={6}
                disabled={loading}
              />
            </div>
            <p className="text-xs text-muted mt-2">
              Mínimo 6 caracteres
            </p>
          </div>

          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div>
                <span>Creando cuenta...</span>
              </div>
            ) : (
              <>
                <FiUserPlus />
                <span>Crear Cuenta</span>
              </>
            )}
          </button>
        </form>

        <p className="auth-link-text">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="auth-link">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}