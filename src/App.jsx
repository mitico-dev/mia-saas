import React, { useState, useEffect, useRef } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, provider, db } from './firebase';
import './index.css';

const ADMIN_EMAILS = ['brianxaviercamacho@gmail.com']; // Aquí puedes agregar más correos autorizados

function App() {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('login'); // 'login' | 'client' | 'dashboard' | 'delivery'

  useEffect(() => {
    // Escuchar si hay un usuario logueado en Firebase
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Redirigir automáticamente si ya eligió un rol antes
        const savedRole = localStorage.getItem(`mia_role_${currentUser.uid}`);
        if (savedRole) {
          setCurrentView(savedRole);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const selectRole = (role) => {
    if (user) {
      localStorage.setItem(`mia_role_${user.uid}`, role);
    }
    setCurrentView(role);
  };

  const handleSwitchRole = () => {
    if (user) {
      localStorage.removeItem(`mia_role_${user.uid}`);
    }
    setCurrentView('login');
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error iniciando sesión:", error);
      alert("Hubo un error al iniciar sesión. Asegúrate de haber habilitado Google en Firebase Authentication.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentView('login');
  };
  const [adminTab, setAdminTab] = useState('caja'); 
  const [editingProduct, setEditingProduct] = useState(null);
  
  // --- LÓGICA CLIENTE ---
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [printPages, setPrintPages] = useState(1); // Será detectado por el sistema
  const [printColor, setPrintColor] = useState('bn'); // 'bn' | 'color'
  const [printCopies, setPrintCopies] = useState(1);
  const [printMaterial, setPrintMaterial] = useState('normal');

  const getMaterialPrice = () => {
    switch(printMaterial) {
      case 'opalina': return 300;
      case 'fotografico': return 800;
      case 'adhesivo': return 1000;
      case 'normal':
      default: return 0;
    }
  };
  const printPrice = ((printColor === 'bn' ? 150 : 500) + getMaterialPrice()) * printPages * (parseInt(printCopies) || 1);

  const handleFileUpload = () => {
    if (!fileUploaded) {
      setFileUploaded(true);
      setPrintPages(12); // Simulamos que el sistema detectó 12 páginas en el PDF
    } else {
      setFileUploaded(false);
      setPrintPages(1);
    }
  };

  // --- LÓGICA DE LA CAJA POS (ADMIN) ---
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cart, setCart] = useState([]);
  const [cajaTotal, setCajaTotal] = useState(() => {
    const saved = localStorage.getItem('mia_caja_v2');
    return saved ? JSON.parse(saved) : 0;
  });

  useEffect(() => {
    localStorage.setItem('mia_caja_v2', JSON.stringify(cajaTotal));
  }, [cajaTotal]);

  const [inventoryDatabase, setInventoryDatabase] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sales, setSales] = useState([]);
  const prevOrderCount = useRef(-1); // Usamos un Ref para no confundir a React
  const [showNotification, setShowNotification] = useState(false);

  // --- SINCRONIZACIÓN DE PEDIDOS EN TIEMPO REAL ---
  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(collection(db, 'orders'), (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => {
          items.push({ ...docSnap.data(), id: docSnap.id });
        });
        const sortedItems = items.reverse();
        
        // --- SISTEMA DE NOTIFICACIÓN EN VIVO ---
        // Si ya teníamos datos y ahora llegan más, es un pedido nuevo
        if (prevOrderCount.current !== -1 && items.length > prevOrderCount.current) {
          setShowNotification(true);
          setTimeout(() => setShowNotification(false), 7000);
          try { 
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play(); 
          } catch(e) {}
        }
        
        prevOrderCount.current = items.length;
        setOrders(sortedItems);
      });
      return () => unsubscribe();
    }
  }, [user]);

  // --- VIGILANTE DE PEDIDOS NUEVOS ---
  useEffect(() => {
    if (orders.length > prevOrderCount.current && prevOrderCount.current !== -1) {
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 6000);
      try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play(); } catch(e) {}
    }
    if (orders.length > 0 || prevOrderCount.current === -1) {
      prevOrderCount.current = orders.length;
    }
  }, [orders.length]);

  // --- SINCRONIZACIÓN DE VENTAS EN TIEMPO REAL ---
  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(collection(db, 'sales'), (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => {
          items.push({ ...docSnap.data(), id: docSnap.id });
        });
        setSales(items.reverse());
      });
      return () => unsubscribe();
    }
  }, [user]);

  // --- SINCRONIZACIÓN EN TIEMPO REAL CON FIRESTORE ---
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...docSnap.data(), id: docSnap.id });
      });
      
      // Auto-migración mágica: si la nube está vacía, subimos los datos viejos
      if (items.length === 0) {
        const saved = localStorage.getItem('mia_inventory_v2');
        if (saved) {
          const localItems = JSON.parse(saved);
          setInventoryDatabase(localItems); // Mostrar rápido
          localItems.forEach(async (item) => {
            await setDoc(doc(db, 'inventory', String(item.id)), item);
          });
        }
      } else {
        setInventoryDatabase(items);
      }
    });

    return () => unsubscribe();
  }, []);

  const [clientCart, setClientCart] = useState([]); // Carrito de la tienda online

  const handleAgregarProducto = () => {
    const product = inventoryDatabase.find(p => p.id === barcodeInput);
    if (product) {
      const cartCount = cart.filter(item => item.id === product.id).length;
      if (cartCount >= product.stock) {
        alert(`Stock insuficiente. Solo tienes ${product.stock} unidades de ${product.name}.`);
        return;
      }
      setCart([...cart, product]);
      setBarcodeInput('');
    } else {
      alert('Código no encontrado. Intenta con: 123, 456, 789 o 101');
    }
  };

  const handleCierreVenta = async () => {
    if (cart.length === 0) return;
    
    const totalVenta = cart.reduce((sum, item) => sum + item.price, 0);
    const nuevaVenta = {
      items: cart.map(i => ({ name: i.name, price: i.price })),
      total: totalVenta,
      fecha: new Date().toLocaleString(),
      vendedor: user.displayName
    };

    // Agrupar items vendidos por ID
    const counts = {};
    cart.forEach(item => { counts[item.id] = (counts[item.id] || 0) + 1; });
    
    // Descontar inventario en la nube en tiempo real
    Object.keys(counts).forEach(async (id) => {
      const product = inventoryDatabase.find(p => p.id === id);
      if (product) {
        const newStock = product.stock - counts[id];
        await setDoc(doc(db, 'inventory', String(id)), { ...product, stock: newStock });
      }
    });

    try {
      // Registrar la venta en el historial en la nube
      await setDoc(doc(collection(db, 'sales')), nuevaVenta);
      setCajaTotal(cajaTotal + totalVenta);
      setCart([]);
      alert(`¡Venta registrada y descontada del stock! $${totalVenta.toLocaleString()}`);
    } catch (error) {
      console.error("Error registrando venta:", error);
    }
  };

  const handleConfirmPrint = async () => {
    if (!fileUploaded) {
      alert('Sube un archivo primero');
      return;
    }

    const nuevoPedido = {
      clienteNombre: user.displayName,
      clienteEmail: user.email,
      archivoNombre: 'Documento_Listo.pdf',
      paginas: printPages,
      color: printColor === 'bn' ? 'B/N' : 'Color',
      material: printMaterial,
      copias: printCopies,
      total: printPrice,
      estado: 'Pendiente',
      fecha: new Date().toLocaleString()
    };

    try {
      await setDoc(doc(collection(db, 'orders')), nuevoPedido);
      alert('¡Pedido de impresión enviado a la nube! El dueño lo recibirá de inmediato.');
      setFileUploaded(false);
      setCurrentView('delivery');
    } catch (error) {
      console.error("Error enviando pedido:", error);
      alert("Error al conectar con la nube.");
    }
  };

  const currentCartTotal = cart.reduce((sum, item) => sum + item.price, 0);

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const productId = formData.get('id');
    const newProduct = {
      id: productId,
      name: formData.get('name'),
      price: parseInt(formData.get('price')) || 0,
      stock: parseInt(formData.get('stock')) || 0,
      icon: formData.get('icon') || '📦',
      image: editingProduct.image || ''
    };

    try {
      if (editingProduct.isNew && inventoryDatabase.find(p => p.id === productId)) {
        alert('Ese código de producto ya existe en la nube.');
        return;
      }
      // Guarda y sincroniza en la nube automáticamente
      await setDoc(doc(db, 'inventory', productId), newProduct);
      setEditingProduct(null);
    } catch (error) {
      console.error("Error guardando producto:", error);
      alert("Hubo un error al guardar en Firebase.");
    }
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('¿Seguro que quieres eliminar este producto de la nube?')) {
      try {
        await deleteDoc(doc(db, 'inventory', String(id)));
      } catch (error) {
        console.error("Error borrando producto:", error);
      }
    }
  };

  // --- PANTALLA DE INICIO / SELECTOR DE PERFIL ---
  if (currentView === 'login') {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column' }}>
        <div className="glass panel" style={{ maxWidth: '450px', width: '90%', textAlign: 'center', padding: '3rem 2rem', animation: 'fadeIn 0.5s ease-out' }}>
          <div className="logo" style={{ fontSize: '3rem', marginBottom: '1rem' }}>MIA-<span style={{color: '#ec4899'}}>SAAS</span></div>
          <h2 style={{ marginBottom: '1rem' }}>Bienvenido</h2>
          <p style={{ color: 'var(--text-light)', marginBottom: '2rem' }}>
            Para continuar, inicia sesión con tu cuenta de Google.
          </p>
          
          {user ? (
            <div style={{ animation: 'fadeIn 0.5s' }}>
              <img src={user.photoURL} alt="perfil" style={{ width: '80px', borderRadius: '50%', marginBottom: '1rem', border: '3px solid var(--primary)' }} />
              <p style={{ marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1.2rem' }}>Hola, {user.displayName}</p>
              <p style={{ color: 'var(--text-light)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>¿Cómo usarás la plataforma?</p>
              
              <button className="btn" onClick={() => selectRole('client')} style={{ width: '100%', marginBottom: '1.5rem', padding: '1.2rem', fontSize: '1.1rem', background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}>
                🛍️ Quiero Comprar (Soy Cliente)
              </button>
              
              {ADMIN_EMAILS.includes(user.email) && (
                <button className="btn" onClick={() => selectRole('dashboard')} style={{ width: '100%', background: '#1e293b', color: 'white', padding: '1.2rem', fontSize: '1.1rem' }}>
                  🏬 Tengo un Negocio (Soy Dueño)
                </button>
              )}
              
              {!ADMIN_EMAILS.includes(user.email) && (
                <p style={{fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '1rem'}}>
                  Nota: Solo los administradores autorizados pueden acceder al panel de negocio.
                </p>
              )}
              
              <button onClick={handleLogout} style={{ marginTop: '1.5rem', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold' }}>
                Cerrar sesión
              </button>
            </div>
          ) : (
            <button className="btn" onClick={handleGoogleLogin} style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem', background: 'white', color: 'var(--text-main)', border: '1px solid #ccc', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '24px' }} />
              Iniciar sesión con Google
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- VISTA DEL SOFTWARE MIA-SAAS (ADMIN) ---
  if (currentView === 'dashboard') {
    // Seguridad extra: si alguien intenta entrar aquí sin permiso, lo sacamos
    if (!user || !ADMIN_EMAILS.includes(user.email)) {
      setCurrentView('client');
      return null;
    }
    return (
      <div className="app-container">
        {/* --- NOTIFICACIÓN FLOTANTE GLOBAL --- */}
        {showNotification && (
          <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#f59e0b', color: 'white', padding: '1rem 2rem', borderRadius: '12px', boxShadow: '0 10px 15px rgba(0,0,0,0.2)', zIndex: 9999, animation: 'slideInRight 0.5s ease-out', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{fontSize: '1.5rem'}}>🔔</span>
            <div>
              <b style={{display: 'block'}}>¡NUEVO PEDIDO RECIBIDO!</b>
              <small>Revisa la pestaña de Pedidos</small>
            </div>
          </div>
        )}
        <header className="glass">
          <div className="logo">MIA-<span style={{color: '#ec4899'}}>SAAS</span></div>
          <nav>
            <ul style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
              <li><button className="btn" style={{padding: '0.5rem 1rem', background: adminTab==='resumen'?'var(--primary)':'transparent', color: adminTab==='resumen'?'white':'var(--text-main)'}} onClick={() => setAdminTab('resumen')}>📈 Resumen</button></li>
              <li><button className="btn" style={{padding: '0.5rem 1rem', background: adminTab==='pedidos'?'#f59e0b':'transparent', color: adminTab==='pedidos'?'white':'var(--text-main)'}} onClick={() => setAdminTab('pedidos')}>🔔 Pedidos {(orders || []).filter(o => o.estado === 'Pendiente').length > 0 && <span style={{background: 'red', color: 'white', padding: '2px 6px', borderRadius: '50%', fontSize: '0.7rem'}}>{orders.filter(o => o.estado === 'Pendiente').length}</span>}</button></li>
              <li><button className="btn" style={{padding: '0.5rem 1rem', background: adminTab==='inventario'?'var(--primary)':'transparent', color: adminTab==='inventario'?'white':'var(--text-main)'}} onClick={() => setAdminTab('inventario')}>📦 Inventario</button></li>
              <li><button className="btn" style={{padding: '0.5rem 1rem', background: adminTab==='caja'?'var(--primary)':'transparent', color: adminTab==='caja'?'white':'var(--text-main)'}} onClick={() => setAdminTab('caja')}>💰 Caja POS</button></li>
              <li><a href="#" onClick={handleSwitchRole} style={{marginLeft: '2rem', color: 'var(--text-light)'}}>🔄 Cambiar de Rol</a></li>
            </ul>
          </nav>
        </header>

        {adminTab === 'pedidos' && (
          <section className="dashboard" style={{animation: 'fadeIn 0.5s ease-out'}}>
            <h2 className="section-title">Cola de Impresiones en la Nube</h2>
            <div className="grid" style={{gridTemplateColumns: '1fr'}}>
              {orders.length === 0 ? (
                <div className="glass panel" style={{textAlign: 'center', padding: '3rem'}}>
                  <p style={{fontSize: '1.2rem', color: 'var(--text-light)'}}>No hay pedidos pendientes aún. ☕</p>
                </div>
              ) : (
                orders.map(order => (
                  <div key={order.id} className="glass panel" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: order.estado==='Pendiente'?'5px solid #f59e0b':'5px solid #10b981', marginBottom: '1rem'}}>
                    <div>
                      <h3 style={{marginBottom: '0.5rem'}}>{order.archivoNombre} <span style={{fontSize: '0.8rem', background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px'}}>{order.estado}</span></h3>
                      <p style={{fontSize: '0.9rem', color: 'var(--text-light)'}}>
                        👤 {order.clienteNombre} | 📄 {order.paginas} págs ({order.color}) | 📦 {order.material} | 📅 {order.fecha}
                      </p>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <p style={{fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.5rem'}}>${order.total.toLocaleString()}</p>
                      {order.estado === 'Pendiente' && (
                        <button className="btn" onClick={async () => {
                          await setDoc(doc(db, 'orders', order.id), { ...order, estado: 'Listo' });
                        }} style={{background: '#10b981', padding: '0.5rem 1rem'}}>Listo para entrega</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {adminTab === 'resumen' && (
          <section className="dashboard" style={{animation: 'fadeIn 0.5s ease-out'}}>
            <h2 className="section-title">Análisis de Ventas</h2>
            <div className="metrics-grid" style={{marginBottom: '2rem'}}>
              <div className="metric-card glass">
                <h3>Ventas Totales (Acumulado)</h3>
                <p className="metric-value">${sales.reduce((acc, v) => acc + v.total, 0).toLocaleString()}</p>
                <span className="metric-trend positive">↑ {sales.length} transacciones</span>
              </div>
              <div className="metric-card glass">
                <h3>Venta Promedio</h3>
                <p className="metric-value">${sales.length > 0 ? Math.round(sales.reduce((acc, v) => acc + v.total, 0) / sales.length).toLocaleString() : 0}</p>
              </div>
              <div className="metric-card glass" style={{cursor: 'pointer', border: '1px dashed #f59e0b'}} onClick={() => { setShowNotification(true); setTimeout(()=>setShowNotification(false), 3000); }}>
                <h3>⚙️ Probar</h3>
                <p style={{color: '#f59e0b'}}>Clic para probar alerta naranja</p>
              </div>
            </div>

            <h3 style={{marginBottom: '1rem'}}>Historial de Movimientos</h3>
            <div className="glass panel" style={{overflowX: 'auto'}}>
              <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid #e2e8f0', color: 'var(--text-light)'}}>
                    <th style={{padding: '1rem'}}>FECHA</th>
                    <th>PRODUCTOS</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {(sales || []).map(v => (
                    <tr key={v.id} style={{borderBottom: '1px solid #e2e8f0'}}>
                      <td style={{padding: '1rem', fontSize: '0.9rem'}}>{v.fecha}</td>
                      <td style={{fontSize: '0.9rem'}}>{v.items.map(i => i.name).join(', ')}</td>
                      <td style={{fontWeight: 'bold'}}>${v.total.toLocaleString()}</td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr><td colSpan="3" style={{textAlign: 'center', padding: '2rem', color: 'var(--text-light)'}}>No hay ventas registradas aún.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {adminTab === 'inventario' && (
          <section className="dashboard" style={{animation: 'fadeIn 0.5s ease-out'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 className="section-title" style={{ margin: 0 }}>Gestión de Inventario</h2>
              <button className="btn" onClick={() => setEditingProduct({ isNew: true, id: '', name: '', price: 0, stock: 0, icon: '📦', image: '' })}>+ Agregar Producto</button>
            </div>

            {editingProduct ? (
              <div className="glass panel" style={{ animation: 'fadeIn 0.3s' }}>
                <h3>{editingProduct.isNew ? 'Nuevo Producto' : 'Editar Producto'}</h3>
                <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input name="id" defaultValue={editingProduct.id} readOnly={!editingProduct.isNew} placeholder="Código (ej. 102)" required style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc', flex: 1 }} />
                    <input name="icon" defaultValue={editingProduct.icon} placeholder="Emoji / Ícono (ej. 📏)" style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc', width: '100px' }} />
                  </div>
                  <input name="name" defaultValue={editingProduct.name} placeholder="Nombre del Producto" required style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc' }} />
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input type="number" name="price" defaultValue={editingProduct.price} placeholder="Precio de Venta ($)" required style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc', flex: 1 }} />
                    <input type="number" name="stock" defaultValue={editingProduct.stock} placeholder="Cantidad en Stock" required style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #ccc', flex: 1 }} />
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(99, 102, 241, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--primary)' }}>
                    <label style={{ fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: 'bold' }}>📷 Sube una foto del producto (JPG/PNG):</label>
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setEditingProduct(prev => ({ ...prev, image: reader.result }));
                        };
                        reader.readAsDataURL(file);
                      }
                    }} style={{ padding: '0.5rem' }} />
                    
                    {editingProduct.image && editingProduct.image.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.5rem' }}>Vista previa:</p>
                        <img src={editingProduct.image} alt="Vista previa" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '12px', border: '2px solid var(--primary)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button type="submit" className="btn" style={{ flex: 1, background: '#10b981' }}>💾 Guardar</button>
                    <button type="button" className="btn" onClick={() => setEditingProduct(null)} style={{ flex: 1, background: '#ef4444' }}>❌ Cancelar</button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="glass panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: 'var(--text-light)' }}>
                      <th style={{ padding: '1rem' }}>CÓDIGO</th>
                      <th>PRODUCTO</th>
                      <th>PRECIO</th>
                      <th>STOCK</th>
                      <th>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryDatabase.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}>
                        <td style={{ padding: '1rem', fontWeight: 'bold' }}>{item.id}</td>
                        <td style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0' }}>
                          {item.image ? <img src={item.image} alt="prod" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px' }} /> : <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>}
                          {item.name}
                        </td>
                        <td>${item.price.toLocaleString()}</td>
                        <td>
                          <span style={{ background: item.stock > 20 ? '#dcfce7' : '#fee2e2', color: item.stock > 20 ? '#166534' : '#991b1b', padding: '0.4rem 0.8rem', borderRadius: '1rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            {item.stock} unds
                          </span>
                        </td>
                        <td>
                          <button onClick={() => setEditingProduct(item)} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '1.2rem', marginRight: '1rem' }}>✏️</button>
                          <button onClick={() => handleDeleteProduct(item.id)} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '1.2rem' }}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {adminTab === 'caja' && (
          <section className="dashboard" style={{animation: 'fadeIn 0.5s ease-out'}}>
            <h2 className="section-title">Facturación y Punto de Venta</h2>
            <div className="grid">
              <div className="glass panel">
                <h3>Nueva Venta</h3>
                <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
                  <input type="text" placeholder="Escribe el código (ej. 123, 456, 789)..." value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAgregarProducto()} style={{flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0'}} />
                  <button className="btn" onClick={handleAgregarProducto}>Agregar</button>
                </div>
                <div style={{marginTop: '2rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px'}}>
                  {cart.length === 0 ? (
                    <p style={{textAlign: 'center', color: 'var(--text-light)', padding: '2rem 0'}}>🛒 El carrito está vacío. Escanea un producto.</p>
                  ) : (
                    <div>
                      <ul style={{listStyle: 'none'}}>
                        {cart.map((item, index) => (
                          <li key={index} style={{display: 'flex', justifyContent: 'space-between', padding: '0.8rem 0', borderBottom: '1px solid #e2e8f0'}}>
                            <span>{item.name}</span><b>${item.price.toLocaleString()}</b>
                          </li>
                        ))}
                      </ul>
                      <h2 style={{textAlign: 'right', marginTop: '1rem'}}>Total: ${currentCartTotal.toLocaleString()}</h2>
                    </div>
                  )}
                </div>
              </div>
              <div className="glass panel" style={{background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(236, 72, 153, 0.08))', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                <h3>Rentabilidad del Día</h3>
                <h1 style={{fontSize: '3.5rem', margin: '1rem 0', color: 'var(--text-main)'}}>${cajaTotal.toLocaleString()}</h1>
                <p style={{fontSize: '1.1rem', color: 'var(--text-light)'}}>Todo actualizado en tiempo real.</p>
                <button className="btn" onClick={handleCierreVenta} style={{width: '100%', marginTop: '3rem', background: cart.length > 0 ? '#10b981' : '#ccc', cursor: cart.length > 0 ? 'pointer' : 'not-allowed'}} disabled={cart.length === 0}>
                  {cart.length > 0 ? `Cobrar $${currentCartTotal.toLocaleString()}` : 'Agrega productos para cobrar'}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  // --- VISTA DE RASTREO DE DELIVERY ---
  if (currentView === 'delivery') {
    return (
      <div className="app-container">
        {/* --- NOTIFICACIÓN FLOTANTE GLOBAL --- */}
        {showNotification && (
          <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#f59e0b', color: 'white', padding: '1rem 2rem', borderRadius: '12px', boxShadow: '0 10px 15px rgba(0,0,0,0.2)', zIndex: 9999, animation: 'slideInRight 0.5s ease-out', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{fontSize: '1.5rem'}}>🔔</span>
            <div>
              <b style={{display: 'block'}}>¡NUEVO PEDIDO RECIBIDO!</b>
              <small>Revisa la pestaña de Pedidos</small>
            </div>
          </div>
        )}
        <header className="glass">
          <div className="logo">MIA-<span style={{color: '#10b981'}}>SAAS</span> <span style={{fontSize: '1rem', fontWeight: 'normal'}}>Delivery</span></div>
          <nav><ul><li><a href="#" onClick={() => setCurrentView('client')}>← Volver a la Tienda</a></li></ul></nav>
        </header>

        <section className="delivery-tracker glass panel" style={{maxWidth: '600px', margin: '0 auto', textAlign: 'center'}}>
          <h2>Rastreo de tu Pedido #1043</h2>
          <p style={{color: 'var(--text-light)', marginBottom: '2rem'}}>Impresión B/N (10 páginas)</p>
          <div className="map-placeholder" style={{ background: 'linear-gradient(45deg, #e2e8f0, #cbd5e1)', height: '200px', borderRadius: '16px', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>🗺️📍</div>
          <div className="timeline">
            <div className="timeline-step completed">✅ Pedido Recibido</div>
            <div className="timeline-step completed">✅ Imprimiendo / Empacando</div>
            <div className="timeline-step active">🚚 En camino (Llega en 5 min)</div>
            <div className="timeline-step">🏠 Entregado</div>
          </div>
        </section>
      </div>
    );
  }

  // --- VISTA DE LA TIENDA CLIENTE (B2C) ---
  return (
    <div className="app-container">
      {/* --- NOTIFICACIÓN FLOTANTE GLOBAL --- */}
      {showNotification && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#f59e0b', color: 'white', padding: '1rem 2rem', borderRadius: '12px', boxShadow: '0 10px 15px rgba(0,0,0,0.2)', zIndex: 9999, animation: 'slideInRight 0.5s ease-out', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{fontSize: '1.5rem'}}>🔔</span>
          <div>
            <b style={{display: 'block'}}>¡NUEVO PEDIDO RECIBIDO!</b>
            <small>Revisa la pestaña de Pedidos</small>
          </div>
        </div>
      )}
      <header className="glass">
        <div className="logo">MIA-<span style={{color: '#ec4899'}}>SAAS</span> <span style={{fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-light)'}}>Store</span></div>
        <nav>
          <ul>
            <li><a href="#marketplace">Catálogo</a></li>
            <li><a href="#impresion">Impresión</a></li>
            <li><a href="#" onClick={() => setCurrentView('delivery')} style={{color: '#10b981'}}>🚚 Ver Delivery</a></li>
            <li><a href="#" onClick={handleSwitchRole} style={{color: 'var(--primary)', fontWeight: 'bold'}}>🔄 Cambiar de Rol</a></li>
          </ul>
        </nav>
      </header>
      
      <section className="hero">
        <h1>Tu papelería digital,<br /> sin complicaciones.</h1>
        <p>Pide tus suministros escolares o profesionales y envía tus documentos a imprimir en segundos, potenciado por tecnología MIA-SAAS.</p>
      </section>

      <section id="marketplace">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Catálogo de Productos</h2>
          <button className="glass" onClick={() => setIsCartOpen(true)} style={{ padding: '0.6rem 1.2rem', borderRadius: '20px', fontWeight: 'bold', background: clientCart.length > 0 ? 'var(--primary)' : 'transparent', color: clientCart.length > 0 ? 'white' : 'var(--text-main)', transition: 'all 0.3s', border: 'none', cursor: 'pointer' }}>
            🛒 Ver Carrito: {clientCart.length} {clientCart.length === 1 ? 'item' : 'items'}
          </button>
        </div>

        {/* --- MODAL DEL CARRITO DEL CLIENTE --- */}
        {isCartOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, animation: 'fadeIn 0.3s' }}>
            <div className="glass panel" style={{ width: '90%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid rgba(0,0,0,0.1)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Tu Carrito Online</h2>
                <button onClick={() => setIsCartOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>❌</button>
              </div>
              
              {clientCart.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem 0' }}>Tu carrito está vacío.</p>
              ) : (
                <>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {clientCart.map((item, index) => (
                      <li key={index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <span>{item.icon} {item.name}</span>
                        <b>${item.price.toLocaleString()}</b>
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: '2rem', textAlign: 'right' }}>
                    <h3 style={{ color: 'var(--text-main)', fontSize: '1.5rem' }}>
                      Total: ${clientCart.reduce((acc, item) => acc + item.price, 0).toLocaleString()}
                    </h3>
                    <button className="btn" onClick={async () => {
                        const totalVenta = clientCart.reduce((acc, item) => acc + item.price, 0);
                        const nuevoPedido = {
                          clienteNombre: user.displayName,
                          clienteEmail: user.email,
                          archivoNombre: '📦 Compra de Productos',
                          paginas: 0,
                          color: 'N/A',
                          material: 'Varios',
                          copias: 0,
                          total: totalVenta,
                          items: clientCart.map(i => i.name),
                          estado: 'Pendiente',
                          fecha: new Date().toLocaleString()
                        };
                        try {
                          await setDoc(doc(collection(db, 'orders')), nuevoPedido);
                          alert('¡Pedido de productos enviado! El dueño lo preparará para ti.');
                          setClientCart([]);
                          setIsCartOpen(false);
                        } catch (e) { alert('Error al enviar pedido'); }
                    }} style={{ width: '100%', marginTop: '1rem', padding: '1rem', fontSize: '1.1rem' }}>
                      Pagar y Confirmar Pedido
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {inventoryDatabase.map(product => (
            <div key={product.id} className="card glass" style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                {product.image ? (
                  <div style={{ width: '100%', height: '180px', marginBottom: '1rem', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{ fontSize: '4rem', marginBottom: '1rem', filter: 'drop-shadow(0 10px 10px rgba(0,0,0,0.1))' }}>{product.icon}</div>
                )}
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', minHeight: '48px' }}>{product.name}</h3>
              </div>
              <div>
                <p style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.5rem', margin: '1rem 0' }}>
                  ${product.price.toLocaleString()}
                </p>
                <button className="btn" onClick={() => {
                  const inCartCount = clientCart.filter(item => item.id === product.id).length;
                  if (inCartCount >= product.stock) {
                    alert(`¡Lo sentimos! Solo nos quedan ${product.stock} unidades en stock.`);
                    return;
                  }
                  setClientCart([...clientCart, product]);
                }} style={{ width: '100%', padding: '0.8rem', fontSize: '1rem', background: 'transparent', border: '2px solid var(--primary)', color: 'var(--primary)', transition: 'all 0.2s' }}
                onMouseOver={(e) => { e.target.style.background = 'var(--primary)'; e.target.style.color = 'white'; }}
                onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--primary)'; }}>
                  + Agregar al Carrito
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="impresion">
        <div className="print-module glass">
          <div className="print-header">
            <h2>Impresión Digital Inteligente</h2>
            <p>Sube tu documento desde tu smartphone o PC, elige las opciones y recíbelo por delivery.</p>
          </div>
          
          <div className="print-upload-area" onClick={handleFileUpload}>
            {fileUploaded ? (
              <div>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                <h3>Documento listo.pdf</h3>
                <p style={{ color: 'green', fontWeight: 'bold', marginTop: '0.5rem' }}>✓ Detectadas automáticamente: {printPages} páginas</p>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>☁️</div>
                <h3>Toca aquí para subir tu documento</h3>
                <p>Soporta PDF, DOCX, JPG (Máx. 50MB)</p>
              </div>
            )}
          </div>

          {fileUploaded && (
            <div className="print-options" style={{ animation: 'fadeIn 0.5s ease-out' }}>
              <div className="option-group">
                <label>Tipo de Papel</label>
                <select value={printMaterial} onChange={(e) => setPrintMaterial(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <option value="normal">Papel Normal (Carta / Oficio)</option>
                  <option value="opalina">Opalina (+ $300)</option>
                  <option value="fotografico">Papel Fotográfico (+ $800)</option>
                  <option value="adhesivo">Papel Fotográfico Adhesivo (+ $1000)</option>
                </select>
              </div>
              <div className="option-group">
                <label>Color</label>
                <select value={printColor} onChange={(e) => setPrintColor(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <option value="bn">Blanco y Negro ($150 base)</option>
                  <option value="color">A color ($500 base)</option>
                </select>
              </div>
              <div className="option-group">
                <label>Copias a imprimir</label>
                <input type="number" min="1" value={printCopies} onChange={(e) => setPrintCopies(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              </div>
            </div>
          )}
          
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            {fileUploaded && (
              <h3 style={{ marginBottom: '1rem', color: 'var(--text-main)', fontSize: '1.5rem' }}>
                Total a pagar: ${printPrice.toLocaleString()}
              </h3>
            )}
            <button className="btn" onClick={() => {
                if(!fileUploaded) { alert('Toca el área de arriba para subir un archivo primero'); return; }
                handleConfirmPrint();
              }} style={{ width: '100%', maxWidth: '300px', background: fileUploaded ? 'var(--primary)' : '#ccc' }}>
              Confirmar Impresión y Delivery
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}

export default App;
