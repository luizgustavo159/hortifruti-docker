import { useEffect, useState, useCallback } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./AdminFuncionarios.css";

export function AdminFuncionarios() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showNewEmployeeModal, setShowNewEmployeeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "operator",
    is_active: true,
  });

  const roles = [
    { value: "admin", label: "Administrador", color: "#f44336" },
    { value: "manager", label: "Gerente", color: "#ff9800" },
    { value: "supervisor", label: "Supervisor", color: "#2196f3" },
    { value: "operator", label: "Operador", color: "#4caf50" },
  ];

  // Carregar funcionários
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/users");
      setEmployees(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError.message || "Falha ao carregar funcionários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Filtrar funcionários
  const filteredEmployees = employees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Criar novo funcionário
  const handleCreateEmployee = async () => {
    if (!formData.name || !formData.email || !formData.password || !formData.role) {
      setError("Preencha todos os campos obrigatórios (incluindo senha).");
      return;
    }

    try {
      const newEmployee = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        is_active: formData.is_active ? 1 : 0,
        phone: "",
        permissions: formData.role === 'admin' 
          ? ["admin", "logs", "relatorios", "descontos", "estoque", "caixa"]
          : ["caixa", "estoque"]
      };

      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify(newEmployee),
      });

      setSuccessMessage("Funcionário criado com sucesso!");
      setFormData({ name: "", email: "", password: "", role: "operator", is_active: true });
      setShowNewEmployeeModal(false);
      loadEmployees();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (createError) {
      setError(createError.message || "Erro ao criar funcionário.");
    }
  };

  // Editar funcionário
  const handleEditEmployee = async () => {
    if (!formData.name || !formData.email || !formData.role) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      const updatedEmployee = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        is_active: formData.is_active ? 1 : 0,
      };

      if (formData.password && formData.password.trim().length > 0) {
        updatedEmployee.password = formData.password;
      }

      await apiFetch(`/users/${selectedEmployee.id}`, {
        method: "PUT",
        body: JSON.stringify(updatedEmployee),
      });

      setSuccessMessage("Funcionário atualizado com sucesso!");
      setShowEditModal(false);
      setSelectedEmployee(null);
      loadEmployees();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (editError) {
      setError(editError.message || "Erro ao atualizar funcionário.");
    }
  };

  // Deletar funcionário
  const handleDeleteEmployee = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar este funcionário?")) return;
    try {
      await apiFetch(`/users/${id}`, { method: "DELETE" });
      setSuccessMessage("Funcionário deletado com sucesso!");
      loadEmployees();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (deleteError) {
      setError(deleteError.message || "Erro ao deletar funcionário.");
    }
  };

  const openEditModal = (employee) => {
    setSelectedEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      is_active: Boolean(employee.is_active),
      password: ""
    });
    setShowEditModal(true);
  };

  return (
    <PageShell
      title="Gerenciamento de Funcionários"
      subtitle="Cadastro e controle de acesso"
      actions={<button className="button" onClick={() => { setFormData({ name: "", email: "", password: "", role: "operator", is_active: true }); setShowNewEmployeeModal(true); }}>Novo Funcionário</button>}
    >
      <div className="employees-container">
        {error && <div className="error-message">{error}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}

        <div className="search-section" style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            style={{ width: '100%' }}
          />
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Cargo</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="loading">Carregando...</td></tr>
              ) : filteredEmployees.length > 0 ? (
                filteredEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td><strong>{employee.name}</strong></td>
                    <td>{employee.email}</td>
                    <td><span className="user-role-badge">{employee.role}</span></td>
                    <td>
                      <span className={`status ${employee.is_active ? "ok" : "critical"}`}>
                        {employee.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-action" onClick={() => openEditModal(employee)}>Editar</button>
                        <button className="btn-action" style={{ background: 'var(--accent-danger)' }} onClick={() => handleDeleteEmployee(employee.id)}>Deletar</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5" className="no-data">Nenhum funcionário encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(showNewEmployeeModal || showEditModal) && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{showEditModal ? "Editar Funcionário" : "Novo Funcionário"}</h2>
            <div className="form-group">
              <label>Nome Completo</label>
              <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="input" />
            </div>
            <div className="form-group">
              <label>Senha {showEditModal && "(deixe em branco para manter)"}</label>
              <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="input" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Cargo</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="input">
                  {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={formData.is_active ? "active" : "inactive"} onChange={e => setFormData({...formData, is_active: e.target.value === "active"})} className="input">
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={showEditModal ? handleEditEmployee : handleCreateEmployee}>Salvar</button>
              <button className="btn-secondary" onClick={() => { setShowNewEmployeeModal(false); setShowEditModal(false); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
