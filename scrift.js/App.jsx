import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { 
  Coffee, ShoppingCart, UserCircle, Settings as SettingsIcon, Store, 
  Package, BookOpen, Clock, LogOut, CheckCircle2, 
  XCircle, Printer, Image as ImageIcon, Calendar, 
  TrendingUp, ArrowLeft, Trash2, Edit, Plus, Upload,
  Star
} from 'lucide-react';

// Initialize Firebase
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'coffee-pos-v1';

// Theme Colors
const theme = {
  primary: '#8B5A2B', // Coffee Brown
  secondary: '#D2B48C', // Tangaga
  accent: '#CD853F', // Peru
  bg: '#FFF8DC', // Cornsilk
  text: '#3E2723', // Dark Brown
  white: '#FFFFFF',
  danger: '#DC2626',
  success: '#16A34A'
};

// Utility to resize image to base64 (to avoid Firestore 1MB limit)
const resizeImage = (file, maxWidth = 800, maxHeight = 800) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6)); // 60% quality jpeg
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const formatRp = (num) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
};

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-[#8B5A2B] text-white rounded-t-xl">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="hover:bg-white/20 rounded-full p-1"><XCircle size={24} /></button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default function CoffeeApp() {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  
  // App States
  const [role, setRole] = useState(null); // 'owner', 'admin', 'customer', null
  const [activeTab, setActiveTab] = useState('pos');
  const [loading, setLoading] = useState(true);

  // Data States
  const [settings, setSettings] = useState({
    storeName: 'IQ Coffee',
    ownerName: 'Owner',
    isOpen: true,
    ownerPin: '1234',
    adminPin: '0000'
  });
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [orders, setOrders] = useState([]);
  
  // Operational States
  const [cart, setCart] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('cash'); // cash, qris
  const [cashGiven, setCashGiven] = useState(0);
  const [qrisProof, setQrisProof] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [toast, setToast] = useState(null);
  const [printData, setPrintData] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      if (usr) {
        setUser(usr);
        setUserId(usr.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Firebase paths setup properly with correct Collection-Document segments
    // Config document inside 'config' collection (Even segment count: artifacts/appId/public/data/config/settings)
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings');
    const productsRef = collection(db, 'artifacts', appId, 'public', 'data', 'products');
    const ingredientsRef = collection(db, 'artifacts', appId, 'public', 'data', 'ingredients');
    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');

    // Listen to Settings
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        // Init default settings
        setDoc(settingsRef, settings).catch(err => console.error("Error creating default settings:", err));
      }
    }, (err) => console.error("Settings err:", err));

    // Listen to Products
    const unsubProducts = onSnapshot(productsRef, (snapshot) => {
      const prods = [];
      snapshot.forEach(doc => prods.push({ id: doc.id, ...doc.data() }));
      setProducts(prods);
    }, (err) => console.error(err));

    // Listen to Ingredients
    const unsubIngredients = onSnapshot(ingredientsRef, (snapshot) => {
      const ings = [];
      snapshot.forEach(doc => ings.push({ id: doc.id, ...doc.data() }));
      setIngredients(ings);
    }, (err) => console.error(err));

    // Listen to Orders
    const unsubOrders = onSnapshot(ordersRef, (snapshot) => {
      const ords = [];
      snapshot.forEach(doc => ords.push({ id: doc.id, ...doc.data() }));
      // Sort by date desc in memory
      ords.sort((a, b) => b.timestamp - a.timestamp);
      setOrders(ords);
      setLoading(false);
    }, (err) => console.error(err));

    return () => {
      unsubSettings();
      unsubProducts();
      unsubIngredients();
      unsubOrders();
    };
  }, [userId]);

  const calculateHPP = (recipe = []) => {
    let totalHPP = 0;
    recipe.forEach(item => {
      const ing = ingredients.find(i => i.id === item.ingredientId);
      if (ing) {
        const costPerUnit = ing.cost / ing.unitQty; // e.g., Rp 100.000 / 1000g = 100/g
        totalHPP += costPerUnit * item.qty;
      }
    });
    return totalHPP;
  };

  const getBestSellers = useMemo(() => {
    const counts = {};
    orders.filter(o => o.status === 'completed').forEach(order => {
      order.items.forEach(item => {
        counts[item.id] = (counts[item.id] || 0) + item.qty;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  }, [orders]);

  const sortedProducts = useMemo(() => {
    const bestSellerIds = getBestSellers.slice(0, 3); // Top 3
    return [...products].sort((a, b) => {
      const aIsBest = bestSellerIds.includes(a.id);
      const bIsBest = bestSellerIds.includes(b.id);
      if (aIsBest && !bIsBest) return -1;
      if (!aIsBest && bIsBest) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [products, getBestSellers]);

  const categories = ['All', ...new Set(products.map(p => p.category))];
  const filteredProducts = selectedCategory === 'All' 
    ? sortedProducts 
    : sortedProducts.filter(p => p.category === selectedCategory);

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const cartHPP = cart.reduce((sum, item) => sum + (item.hpp * item.qty), 0);

  const addToCart = (product) => {
    if (!settings.isOpen && role === 'customer') {
      showToast("Maaf, kedai sedang tutup.", "danger");
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateCartQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    if (checkoutMode === 'cash' && role !== 'customer') {
      if (cashGiven < cartTotal) {
        showToast("Uang tunai kurang!", "danger");
        return;
      }
    }

    if (checkoutMode === 'qris' && role === 'customer' && !qrisProof) {
      showToast("Harap unggah bukti pembayaran QRIS", "danger");
      return;
    }

    try {
      const newOrder = {
        items: cart,
        total: cartTotal,
        totalHPP: cartHPP,
        grossProfit: cartTotal - cartHPP,
        method: checkoutMode,
        status: role === 'customer' ? 'pending' : 'completed',
        timestamp: Date.now(),
        customerType: role,
        qrisProof: qrisProof || null
      };

      const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
      const docRef = await addDoc(ordersRef, newOrder);

      // If completed immediately (Admin/Owner Cash), deduct stock
      if (newOrder.status === 'completed') {
        await deductStock(cart);
        if (role !== 'customer') {
           setPrintData({...newOrder, id: docRef.id, cashGiven, change: cashGiven - cartTotal});
        }
      } else {
        showToast("Pesanan berhasil dikirim! Menunggu konfirmasi kasir.");
      }

      setCart([]);
      setShowCheckout(false);
      setCashGiven(0);
      setQrisProof(null);
      if(role !== 'customer' && newOrder.status === 'completed') {
        showToast("Transaksi Berhasil!");
      }
    } catch (err) {
      console.error(err);
      showToast("Terjadi kesalahan sistem", "danger");
    }
  };

  const deductStock = async (cartItems) => {
    const batchUpdates = [];
    const localIng = JSON.parse(JSON.stringify(ingredients)); // deep copy

    cartItems.forEach(item => {
      if (item.recipe) {
        item.recipe.forEach(req => {
          const ingIndex = localIng.findIndex(i => i.id === req.ingredientId);
          if (ingIndex > -1) {
            localIng[ingIndex].stock -= (req.qty * item.qty);
            const ingRef = doc(db, 'artifacts', appId, 'public', 'data', 'ingredients', req.ingredientId);
            batchUpdates.push(updateDoc(ingRef, {
              stock: localIng[ingIndex].stock
            }));
          }
        });
      }
    });

    try {
      await Promise.all(batchUpdates);
    } catch (e) {
      console.error("Failed to deduct stock:", e);
    }
  };

  const completeOnlineOrder = async (order) => {
    try {
      const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id);
      await updateDoc(orderRef, { status: 'completed' });
      await deductStock(order.items);
      showToast("Pesanan Online diselesaikan!");
    } catch (err) {
      showToast("Gagal update pesanan", "danger");
    }
  };

  const LoginScreen = () => {
    const [pin, setPin] = useState('');
    
    const handleLogin = (selectedRole) => {
      if (selectedRole === 'customer') {
        setRole('customer');
        return;
      }
      
      if (selectedRole === 'owner') {
        if (pin === settings.ownerPin) setRole('owner');
        else showToast("PIN Owner Salah!", "danger");
      } else if (selectedRole === 'admin') {
        if (pin === settings.adminPin) setRole('admin');
        else showToast("PIN Admin Salah!", "danger");
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8DC] p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md text-center">
          <div className="mx-auto bg-[#8B5A2B] text-white w-20 h-20 flex items-center justify-center rounded-full mb-4 shadow-lg">
            <Coffee size={40} />
          </div>
          <h1 className="text-3xl font-extrabold text-[#3E2723] mb-2">{settings.storeName}</h1>
          <p className="text-gray-500 mb-8">Pilih akses masuk aplikasi</p>

          <div className="space-y-4">
            <input 
              type="password" 
              placeholder="Masukkan PIN" 
              className="w-full text-center text-2xl tracking-[0.5em] p-4 border-2 border-[#D2B48C] rounded-xl focus:outline-none focus:border-[#8B5A2B]"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={6}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleLogin('admin')} className="p-4 bg-[#8B5A2B] hover:bg-[#6b4421] text-white rounded-xl font-bold transition flex flex-col items-center gap-2">
                <UserCircle size={24} /> Masuk Admin
              </button>
              <button onClick={() => handleLogin('owner')} className="p-4 bg-[#3E2723] hover:bg-[#2c1b18] text-white rounded-xl font-bold transition flex flex-col items-center gap-2">
                <Store size={24} /> Masuk Owner
              </button>
            </div>

            <div className="pt-6 border-t border-gray-200 mt-6">
              <button onClick={() => handleLogin('customer')} className="w-full p-4 bg-white border-2 border-[#8B5A2B] text-[#8B5A2B] hover:bg-[#FFF8DC] rounded-xl font-bold transition flex justify-center items-center gap-2">
                <ShoppingCart size={24} /> Pesan Sebagai Pelanggan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TopNav = () => (
    <div className="bg-[#8B5A2B] text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <Coffee size={28} className="text-[#D2B48C]" />
        <div>
          <h1 className="text-xl font-bold leading-tight">{settings.storeName}</h1>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full capitalize">{role} Access</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {role === 'owner' && (
          <div className="hidden md:flex gap-2">
            <button onClick={() => setActiveTab('pos')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'pos' ? 'bg-white text-[#8B5A2B]' : 'hover:bg-white/10'}`}>Kasir</button>
            <button onClick={() => setActiveTab('products')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'products' ? 'bg-white text-[#8B5A2B]' : 'hover:bg-white/10'}`}>Menu</button>
            <button onClick={() => setActiveTab('inventory')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'inventory' ? 'bg-white text-[#8B5A2B]' : 'hover:bg-white/10'}`}>Bahan Baku</button>
            <button onClick={() => setActiveTab('reports')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'reports' ? 'bg-white text-[#8B5A2B]' : 'hover:bg-white/10'}`}>Laporan</button>
            <button onClick={() => setActiveTab('settings')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'settings' ? 'bg-white text-[#8B5A2B]' : 'hover:bg-white/10'}`}>Pengaturan</button>
          </div>
        )}
        <button onClick={() => { setRole(null); setCart([]); }} className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition" title="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </div>
  );

  const POSView = () => (
    <div className="flex flex-col md:flex-row h-[calc(100vh-76px)] bg-[#FFF8DC]">
      {/* Menu Area */}
      <div className="flex-1 p-4 flex flex-col h-full overflow-hidden">
        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar shrink-0">
          {categories.map(cat => (
            <button 
              key={cat} 
              onClick={() => setSelectedCategory(cat)}
              className={`px-6 py-2 rounded-full whitespace-nowrap font-semibold shadow-sm transition ${selectedCategory === cat ? 'bg-[#8B5A2B] text-white' : 'bg-white text-[#3E2723] hover:bg-[#D2B48C]/30'}`}
            >
              {cat}
            </button>
          ))}
        </div>
        
        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pr-2 pb-20 md:pb-0">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => {
              const isBestSeller = getBestSellers.slice(0,3).includes(product.id);
              return (
                <div key={product.id} onClick={() => addToCart(product)} className="bg-white rounded-xl shadow-sm hover:shadow-md transition cursor-pointer overflow-hidden border border-transparent hover:border-[#D2B48C] flex flex-col">
                  <div className="h-32 bg-gray-100 relative">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400"><Coffee size={40} /></div>
                    )}
                    {isBestSeller && (
                      <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-sm">
                        <Star size={12} fill="currentColor" /> Best
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-[#3E2723] leading-tight text-sm md:text-base">{product.name}</h3>
                      <p className="text-xs text-gray-500 mt-1">{product.category}</p>
                    </div>
                    <p className="text-[#8B5A2B] font-bold mt-2">{formatRp(product.price)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cart Area */}
      <div className="w-full md:w-96 bg-white shadow-xl flex flex-col h-full border-l border-gray-200 z-20">
        <div className="p-4 bg-[#3E2723] text-white flex justify-between items-center">
          <h2 className="font-bold flex items-center gap-2"><ShoppingCart size={20} /> Keranjang</h2>
          <span className="bg-[#8B5A2B] px-2 py-1 rounded-full text-xs font-bold">{cart.reduce((a,b)=>a+b.qty,0)} Items</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2">
              <ShoppingCart size={48} opacity={0.5} />
              <p>Keranjang masih kosong</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex justify-between items-center border-b pb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-[#3E2723]">{item.name}</h4>
                  <p className="text-[#8B5A2B] text-sm">{formatRp(item.price)}</p>
                </div>
                <div className="flex items-center gap-3 bg-gray-100 rounded-lg p-1">
                  <button onClick={() => updateCartQty(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-red-500 font-bold">-</button>
                  <span className="w-4 text-center font-bold text-sm">{item.qty}</span>
                  <button onClick={() => updateCartQty(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-green-600 font-bold">+</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between mb-4">
            <span className="text-gray-600 font-medium">Total Harga</span>
            <span className="text-2xl font-black text-[#8B5A2B]">{formatRp(cartTotal)}</span>
          </div>
          <button 
            disabled={cart.length === 0}
            onClick={() => setShowCheckout(true)}
            className="w-full bg-[#16A34A] hover:bg-[#15803d] disabled:bg-gray-300 text-white py-4 rounded-xl font-bold text-lg transition shadow-lg flex justify-center items-center gap-2"
          >
            Bayar Sekarang
          </button>
        </div>
      </div>
    </div>
  );

  const OnlineOrdersTracker = () => {
    const pendingOrders = orders.filter(o => o.status === 'pending');
    if (pendingOrders.length === 0) return null;

    return (
      <div className="fixed bottom-4 left-4 z-40">
        <div className="bg-white rounded-xl shadow-2xl p-4 border-l-4 border-yellow-500 w-80 max-h-96 flex flex-col">
          <h3 className="font-bold flex items-center gap-2 mb-2 text-yellow-700">
            <Clock size={18} /> Pesanan Online Baru ({pendingOrders.length})
          </h3>
          <div className="overflow-y-auto flex-1 space-y-3">
            {pendingOrders.map(order => (
              <div key={order.id} className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-sm">
                <div className="flex justify-between font-bold mb-1">
                  <span>{new Date(order.timestamp).toLocaleTimeString()}</span>
                  <span>{formatRp(order.total)}</span>
                </div>
                <ul className="mb-2 text-gray-700">
                  {order.items.map((i, idx) => <li key={idx}>- {i.qty}x {i.name}</li>)}
                </ul>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-yellow-200">
                  <span className="uppercase text-xs font-bold text-gray-500 bg-white px-2 py-1 rounded">{order.method}</span>
                  {order.method === 'qris' && order.qrisProof && (
                    <a href={order.qrisProof} target="_blank" rel="noreferrer" className="text-blue-600 text-xs flex items-center gap-1 hover:underline">
                      <ImageIcon size={14}/> Lihat Bukti
                    </a>
                  )}
                </div>
                <button onClick={() => completeOnlineOrder(order)} className="mt-2 w-full bg-[#8B5A2B] text-white py-1.5 rounded-lg text-xs font-bold flex justify-center items-center gap-1">
                  <CheckCircle2 size={14} /> Selesaikan Pesanan
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const InventoryTab = () => {
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState({ id: '', name: '', unit: 'g', stock: 0, cost: 0, unitQty: 1000 });

    const saveIngredient = async () => {
      try {
        if (form.id) {
          const ingRef = doc(db, 'artifacts', appId, 'public', 'data', 'ingredients', form.id);
          await updateDoc(ingRef, form);
        } else {
          const ingColRef = collection(db, 'artifacts', appId, 'public', 'data', 'ingredients');
          await addDoc(ingColRef, form);
        }
        showToast("Bahan baku disimpan!");
        setIsEditing(false);
        setForm({ id: '', name: '', unit: 'g', stock: 0, cost: 0, unitQty: 1000 });
      } catch (err) { showToast("Error menyimpan", "danger"); }
    };

    const deleteIng = async (id) => {
      if (confirm("Hapus bahan baku ini?")) {
        const ingRef = doc(db, 'artifacts', appId, 'public', 'data', 'ingredients', id);
        await deleteDoc(ingRef);
      }
    };

    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-[#3E2723]">Kelola Bahan Baku</h2>
          <button onClick={() => setIsEditing(true)} className="bg-[#8B5A2B] text-white px-4 py-2 rounded-lg font-bold flex gap-2"><Plus size={20}/> Tambah Bahan</button>
        </div>

        {isEditing && (
          <div className="bg-white p-6 rounded-xl shadow border border-[#D2B48C] grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-bold text-gray-700">Nama Bahan</label><input type="text" className="w-full border p-2 rounded mt-1" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} /></div>
            <div><label className="block text-sm font-bold text-gray-700">Satuan (g, ml, pcs)</label><input type="text" className="w-full border p-2 rounded mt-1" value={form.unit} onChange={e=>setForm({...form, unit: e.target.value})} /></div>
            <div><label className="block text-sm font-bold text-gray-700">Stok Saat Ini</label><input type="number" className="w-full border p-2 rounded mt-1" value={form.stock} onChange={e=>setForm({...form, stock: Number(e.target.value)})} /></div>
            <div><label className="block text-sm font-bold text-gray-700">Harga Beli Total (Rp)</label><input type="number" className="w-full border p-2 rounded mt-1" value={form.cost} onChange={e=>setForm({...form, cost: Number(e.target.value)})} /></div>
            <div><label className="block text-sm font-bold text-gray-700">Kuantitas untuk Harga Beli (Sesuai Satuan)</label><input type="number" className="w-full border p-2 rounded mt-1" value={form.unitQty} onChange={e=>setForm({...form, unitQty: Number(e.target.value)})} /></div>
            <div className="md:col-span-2 flex justify-end gap-2 mt-4">
              <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-200 rounded font-bold">Batal</button>
              <button onClick={saveIngredient} className="px-4 py-2 bg-[#16A34A] text-white rounded font-bold">Simpan</button>
            </div>
            <div className="md:col-span-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">Info: Misal beli Biji Kopi 1kg (1000g) seharga Rp100.000. Maka Satuan: g, Harga: 100000, Kuantitas: 1000. Modal/g = Rp100.</div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#8B5A2B] text-white">
                <th className="p-3">Nama Bahan</th>
                <th className="p-3">Sisa Stok</th>
                <th className="p-3">Harga Beli</th>
                <th className="p-3">HPP / Satuan</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map(ing => (
                <tr key={ing.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{ing.name}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${ing.stock < 100 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {ing.stock} {ing.unit}
                    </span>
                  </td>
                  <td className="p-3 text-sm">{formatRp(ing.cost)} / {ing.unitQty}{ing.unit}</td>
                  <td className="p-3 text-sm text-[#8B5A2B] font-bold">{formatRp(ing.cost / ing.unitQty)}/{ing.unit}</td>
                  <td className="p-3 flex justify-end gap-2">
                    <button onClick={() => {setForm(ing); setIsEditing(true);}} className="p-2 bg-blue-100 text-blue-600 rounded"><Edit size={16}/></button>
                    <button onClick={() => deleteIng(ing.id)} className="p-2 bg-red-100 text-red-600 rounded"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const ProductsTab = () => {
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState({ id: '', name: '', category: 'Coffee', price: 0, image: '', recipe: [], hpp: 0 });
    
    // Auto calculate HPP when form recipe changes
    useEffect(() => {
      const hpp = calculateHPP(form.recipe);
      setForm(prev => ({...prev, hpp}));
    }, [form.recipe, ingredients]);

    const saveProduct = async () => {
      try {
        if (form.id) {
          const prodRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', form.id);
          await updateDoc(prodRef, form);
        } else {
          const prodColRef = collection(db, 'artifacts', appId, 'public', 'data', 'products');
          await addDoc(prodColRef, form);
        }
        showToast("Menu disimpan!");
        setIsEditing(false);
      } catch (err) { showToast("Error", "danger"); }
    };

    const deleteProd = async (id) => {
      if(confirm("Hapus menu?")) {
        const prodRef = doc(db, 'artifacts', appId, 'public', 'data', 'products', id);
        await deleteDoc(prodRef);
      }
    };

    const addRecipeItem = () => {
      if(ingredients.length === 0) return showToast("Tambahkan bahan baku dulu!", "danger");
      setForm({...form, recipe: [...form.recipe, { ingredientId: ingredients[0].id, qty: 1 }]});
    };

    const updateRecipeItem = (index, field, val) => {
      const newRec = [...form.recipe];
      newRec[index][field] = val;
      setForm({...form, recipe: newRec});
    };

    const removeRecipeItem = (index) => {
      setForm({...form, recipe: form.recipe.filter((_, i) => i !== index)});
    };

    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-[#3E2723]">Kelola Menu & Resep</h2>
          <button onClick={() => {setForm({ id: '', name: '', category: 'Coffee', price: 0, image: '', recipe: [], hpp: 0 }); setIsEditing(true);}} className="bg-[#8B5A2B] text-white px-4 py-2 rounded-lg font-bold flex gap-2"><Plus size={20}/> Tambah Menu</button>
        </div>

        {isEditing && (
          <div className="bg-white p-6 rounded-xl shadow border border-[#D2B48C] grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-bold border-b pb-2 text-lg text-[#3E2723]">Info Menu</h3>
              <div><label className="block text-sm font-bold text-gray-700">Nama Menu</label><input type="text" className="w-full border p-2 rounded mt-1" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} /></div>
              <div><label className="block text-sm font-bold text-gray-700">Kategori</label><input type="text" className="w-full border p-2 rounded mt-1" value={form.category} onChange={e=>setForm({...form, category: e.target.value})} placeholder="Contoh: Coffee, Non-Coffee, Snack" /></div>
              <div><label className="block text-sm font-bold text-gray-700">Harga Jual (Rp)</label><input type="number" className="w-full border p-2 rounded mt-1" value={form.price} onChange={e=>setForm({...form, price: Number(e.target.value)})} /></div>
              <div><label className="block text-sm font-bold text-gray-700">URL Foto (Opsional)</label><input type="text" className="w-full border p-2 rounded mt-1 text-sm" value={form.image} onChange={e=>setForm({...form, image: e.target.value})} placeholder="https://..." /></div>
            </div>
            
            <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-lg text-[#3E2723]">Resep (HPP)</h3>
                <button onClick={addRecipeItem} className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">+ Bahan</button>
              </div>
              
              {form.recipe.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-white p-2 rounded border">
                  <select className="flex-1 border p-1 rounded text-sm" value={item.ingredientId} onChange={e => updateRecipeItem(idx, 'ingredientId', e.target.value)}>
                    {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name} (per {ing.unit})</option>)}
                  </select>
                  <input type="number" className="w-20 border p-1 rounded text-sm" value={item.qty} onChange={e => updateRecipeItem(idx, 'qty', Number(e.target.value))} />
                  <span className="text-xs text-gray-500 w-6">{ingredients.find(i=>i.id===item.ingredientId)?.unit}</span>
                  <button onClick={() => removeRecipeItem(idx)} className="text-red-500 p-1"><XCircle size={18}/></button>
                </div>
              ))}

              <div className="mt-4 pt-4 border-t flex justify-between font-bold text-lg">
                <span>Total HPP / Modal:</span>
                <span className="text-red-600">{formatRp(form.hpp)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold mt-1">
                <span>Estimasi Laba per Cup:</span>
                <span className="text-green-600">{formatRp(form.price - form.hpp)}</span>
              </div>
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 mt-4 pt-4 border-t">
              <button onClick={() => setIsEditing(false)} className="px-6 py-2 bg-gray-200 rounded font-bold">Batal</button>
              <button onClick={saveProduct} className="px-6 py-2 bg-[#16A34A] text-white rounded font-bold">Simpan Menu</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-[#8B5A2B] text-white">
                <th className="p-3">Menu</th>
                <th className="p-3">Kategori</th>
                <th className="p-3">Harga Jual</th>
                <th className="p-3">HPP</th>
                <th className="p-3">Margin Laba</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {products.map(prod => {
                const marginPercent = prod.price > 0 ? ((prod.price - prod.hpp) / prod.price * 100).toFixed(1) : 0;
                return (
                  <tr key={prod.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium flex items-center gap-3">
                      {prod.image ? <img src={prod.image} className="w-8 h-8 rounded-full object-cover"/> : <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center"><Coffee size={16}/></div>}
                      {prod.name}
                    </td>
                    <td className="p-3 text-sm">{prod.category}</td>
                    <td className="p-3 font-bold text-green-700">{formatRp(prod.price)}</td>
                    <td className="p-3 text-red-600 text-sm">{formatRp(prod.hpp)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${marginPercent < 30 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {marginPercent}%
                      </span>
                    </td>
                    <td className="p-3 flex justify-end gap-2">
                      <button onClick={() => {setForm(prod); setIsEditing(true);}} className="p-2 bg-blue-100 text-blue-600 rounded"><Edit size={16}/></button>
                      <button onClick={() => deleteProd(prod.id)} className="p-2 bg-red-100 text-red-600 rounded"><Trash2 size={16}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const ReportsTab = () => {
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

    const filteredOrders = useMemo(() => {
      const selectedDateStr = new Date(dateFilter).toDateString();
      return orders.filter(o => o.status === 'completed' && new Date(o.timestamp).toDateString() === selectedDateStr);
    }, [orders, dateFilter]);

    const stats = useMemo(() => {
      return filteredOrders.reduce((acc, order) => {
        acc.revenue += order.total;
        acc.cogs += order.totalHPP || 0;
        acc.profit += (order.grossProfit || (order.total - (order.totalHPP || 0)));
        return acc;
      }, { revenue: 0, cogs: 0, profit: 0 });
    }, [filteredOrders]);

    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow">
          <h2 className="text-2xl font-bold text-[#3E2723] flex items-center gap-2"><Calendar/> Laporan Penjualan</h2>
          <input 
            type="date" 
            value={dateFilter} 
            onChange={e => setDateFilter(e.target.value)}
            className="border-2 border-[#D2B48C] p-2 rounded-lg font-bold text-[#3E2723]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
            <p className="text-gray-500 font-bold mb-1">Total Pendapatan (Omzet)</p>
            <h3 className="text-3xl font-black text-[#3E2723]">{formatRp(stats.revenue)}</h3>
            <p className="text-sm mt-2 text-blue-600">{filteredOrders.length} Transaksi Selesai</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow border-l-4 border-red-500">
            <p className="text-gray-500 font-bold mb-1">Total HPP (Modal)</p>
            <h3 className="text-3xl font-black text-red-600">{formatRp(stats.cogs)}</h3>
          </div>
          <div className="bg-white p-6 rounded-xl shadow border-l-4 border-green-500">
            <p className="text-gray-500 font-bold mb-1">Laba Kotor (Profit)</p>
            <h3 className="text-3xl font-black text-green-600">{formatRp(stats.profit)}</h3>
            <p className="text-sm mt-2 text-green-700 bg-green-50 inline-block px-2 py-0.5 rounded">Margin: {stats.revenue ? ((stats.profit/stats.revenue)*100).toFixed(1) : 0}%</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-4 bg-gray-50 border-b font-bold text-[#3E2723] flex items-center gap-2">
            <TrendingUp size={20}/> Riwayat Transaksi ({new Date(dateFilter).toLocaleDateString('id-ID')})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-100 text-gray-600 text-sm">
                  <th className="p-3">Waktu</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Tipe</th>
                  <th className="p-3">Pembayaran</th>
                  <th className="p-3 text-right">Omzet</th>
                  <th className="p-3 text-right text-green-600">Laba</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-gray-400">Tidak ada transaksi pada tanggal ini</td></tr>}
                {filteredOrders.map(order => (
                  <tr key={order.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm">{new Date(order.timestamp).toLocaleTimeString()}</td>
                    <td className="p-3 text-sm">
                      {order.items.map((i, idx) => <div key={idx}>{i.qty}x {i.name}</div>)}
                    </td>
                    <td className="p-3"><span className="uppercase text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded">{order.customerType}</span></td>
                    <td className="p-3"><span className="uppercase text-xs font-bold bg-purple-100 text-purple-800 px-2 py-1 rounded">{order.method}</span></td>
                    <td className="p-3 text-right font-bold text-[#3E2723]">{formatRp(order.total)}</td>
                    <td className="p-3 text-right font-bold text-green-600">+{formatRp(order.grossProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const SettingsTab = () => {
    const [localSet, setLocalSet] = useState(settings);

    const saveSettings = async () => {
      try {
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings');
        await setDoc(settingsRef, localSet);
        showToast("Pengaturan Disimpan!");
      } catch (err) { showToast("Gagal menyimpan", "danger"); }
    };

    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-xl shadow space-y-4">
          <h2 className="text-2xl font-bold text-[#3E2723] border-b pb-4 mb-4 flex items-center gap-2"><SettingsIcon/> Pengaturan Kedai</h2>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Nama Kedai Kopi</label>
            <input type="text" className="w-full border-2 p-3 rounded-lg" value={localSet.storeName} onChange={e=>setLocalSet({...localSet, storeName: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Nama Pemilik (Owner)</label>
            <input type="text" className="w-full border-2 p-3 rounded-lg" value={localSet.ownerName} onChange={e=>setLocalSet({...localSet, ownerName: e.target.value})} />
          </div>
          
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
            <div>
              <p className="font-bold text-[#3E2723]">Status Kedai</p>
              <p className="text-xs text-gray-500">Buka/Tutup penerimaan pesanan pelanggan via online.</p>
            </div>
            <button 
              onClick={()=>setLocalSet({...localSet, isOpen: !localSet.isOpen})}
              className={`px-6 py-2 rounded-full font-bold text-white transition ${localSet.isOpen ? 'bg-green-500' : 'bg-red-500'}`}
            >
              {localSet.isOpen ? 'BUKA' : 'TUTUP'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t mt-4">
            <div>
              <label className="block text-sm font-bold text-red-700 mb-1">PIN Admin (Kasir)</label>
              <input type="text" maxLength={6} className="w-full border-2 border-red-200 p-3 rounded-lg bg-red-50 text-center tracking-widest font-bold" value={localSet.adminPin} onChange={e=>setLocalSet({...localSet, adminPin: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold text-red-700 mb-1">PIN Owner (Pemilik)</label>
              <input type="text" maxLength={6} className="w-full border-2 border-red-200 p-3 rounded-lg bg-red-50 text-center tracking-widest font-bold" value={localSet.ownerPin} onChange={e=>setLocalSet({...localSet, ownerPin: e.target.value})} />
            </div>
          </div>

          <button onClick={saveSettings} className="w-full mt-6 bg-[#8B5A2B] hover:bg-[#6b4421] text-white py-4 rounded-xl font-bold text-lg shadow-lg">
            Simpan Perubahan
          </button>
        </div>
      </div>
    );
  };

  const CheckoutModal = () => (
    <Modal isOpen={showCheckout} onClose={() => {setShowCheckout(false); setQrisProof(null);}} title="Selesaikan Pembayaran">
      <div className="space-y-6">
        <div className="bg-gray-100 p-4 rounded-xl text-center">
          <p className="text-gray-500 font-bold mb-1">Total Tagihan</p>
          <p className="text-4xl font-black text-[#8B5A2B]">{formatRp(cartTotal)}</p>
        </div>

        <div>
          <p className="font-bold mb-2">Metode Pembayaran</p>
          <div className="grid grid-cols-2 gap-3">
            {(role === 'admin' || role === 'owner') && (
              <button onClick={()=>setCheckoutMode('cash')} className={`p-3 rounded-xl border-2 font-bold flex flex-col items-center gap-2 transition ${checkoutMode === 'cash' ? 'border-[#8B5A2B] bg-[#FFF8DC] text-[#8B5A2B]' : 'border-gray-200 text-gray-500'}`}>
                <Package size={24}/> Tunai (Cash)
              </button>
            )}
            <button onClick={()=>setCheckoutMode('qris')} className={`p-3 rounded-xl border-2 font-bold flex flex-col items-center gap-2 transition ${checkoutMode === 'qris' ? 'border-[#8B5A2B] bg-[#FFF8DC] text-[#8B5A2B]' : 'border-gray-200 text-gray-500'} ${role === 'customer' ? 'col-span-2' : ''}`}>
              <BookOpen size={24}/> QRIS / Transfer
            </button>
          </div>
        </div>

        {checkoutMode === 'cash' && role !== 'customer' && (
          <div className="space-y-3 animate-fadeIn">
            <p className="font-bold">Uang Diterima</p>
            <input 
              type="number" 
              className="w-full text-2xl p-3 border-2 border-gray-300 rounded-xl focus:border-[#8B5A2B] outline-none text-right font-bold"
              value={cashGiven || ''}
              onChange={e => setCashGiven(Number(e.target.value))}
              placeholder="0"
            />
            <div className="grid grid-cols-4 gap-2">
              <button onClick={()=>setCashGiven(cartTotal)} className="bg-gray-200 p-2 rounded font-bold text-sm hover:bg-gray-300">Uang Pas</button>
              <button onClick={()=>setCashGiven(50000)} className="bg-gray-200 p-2 rounded font-bold text-sm hover:bg-gray-300">50K</button>
              <button onClick={()=>setCashGiven(100000)} className="bg-gray-200 p-2 rounded font-bold text-sm hover:bg-gray-300">100K</button>
              <button onClick={()=>setCashGiven(0)} className="bg-red-100 text-red-600 p-2 rounded font-bold text-sm hover:bg-red-200">Reset</button>
            </div>
            {cashGiven >= cartTotal && (
              <div className="bg-green-100 text-green-800 p-3 rounded-xl flex justify-between font-bold">
                <span>Kembalian:</span>
                <span>{formatRp(cashGiven - cartTotal)}</span>
              </div>
            )}
          </div>
        )}

        {checkoutMode === 'qris' && (
          <div className="space-y-4 animate-fadeIn flex flex-col items-center border-2 border-dashed border-gray-300 p-4 rounded-xl">
            <div className="w-40 h-40 bg-gray-200 flex items-center justify-center p-2 rounded-lg">
              {/* Dummy QR Code UI */}
              <div className="w-full h-full bg-white border-8 border-black flex flex-wrap p-1 relative">
                <div className="absolute top-1 left-1 w-6 h-6 bg-black"></div>
                <div className="absolute top-1 right-1 w-6 h-6 bg-black"></div>
                <div className="absolute bottom-1 left-1 w-6 h-6 bg-black"></div>
                <div className="w-full h-full grid grid-cols-4 grid-rows-4 gap-1 place-items-center p-6">
                   <div className="w-full h-full bg-black"></div><div className="w-full h-full"></div><div className="w-full h-full bg-black"></div>
                </div>
              </div>
            </div>
            <p className="text-center font-bold text-[#8B5A2B]">Scan untuk Bayar</p>
            
            {role === 'customer' && (
              <div className="w-full mt-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Unggah Bukti Transfer (Wajib)</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if(file) {
                      const base64 = await resizeImage(file);
                      setQrisProof(base64);
                    }
                  }}
                  className="hidden"
                  id="qris-upload"
                />
                <label htmlFor="qris-upload" className="w-full flex items-center justify-center gap-2 p-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition font-bold">
                  <Upload size={20}/> {qrisProof ? 'Bukti Terunggah (Ubah)' : 'Pilih Foto Bukti'}
                </label>
                {qrisProof && <img src={qrisProof} className="mt-2 w-full h-32 object-contain rounded-lg border bg-gray-50"/>}
              </div>
            )}
          </div>
        )}

        <button 
          onClick={handleCheckout}
          disabled={(checkoutMode === 'cash' && role !== 'customer' && cashGiven < cartTotal) || (checkoutMode === 'qris' && role === 'customer' && !qrisProof)}
          className="w-full bg-[#16A34A] hover:bg-[#15803d] disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg transition shadow-lg flex justify-center items-center gap-2"
        >
          {role === 'customer' ? 'Kirim Pesanan' : 'Selesaikan Transaksi'}
        </button>
      </div>
    </Modal>
  );

  const PrintReceipt = () => {
    if (!printData) return null;
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center p-4 print-container hidden-print">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; max-width: 58mm; padding: 0; margin: 0; font-family: monospace; font-size: 12px; color: black; background: white; }
            .hidden-print { display: none !important; }
            @page { margin: 0; }
          }
        `}</style>
        
        <div className="bg-white p-4 w-80 max-h-[80vh] overflow-y-auto rounded-lg shadow-2xl relative flex flex-col">
          <div className="print-area bg-white text-black p-4" id="receipt-content">
            <div className="text-center mb-4">
              <h2 className="font-bold text-lg leading-none">{settings.storeName}</h2>
              <p className="text-xs mt-1">Receipt: #{printData.id.substring(0,6).toUpperCase()}</p>
              <p className="text-xs">{new Date(printData.timestamp).toLocaleString('id-ID')}</p>
            </div>
            
            <div className="border-t border-b border-black border-dashed py-2 mb-2 space-y-1">
              {printData.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span>{item.qty}x {item.name}</span>
                  <span>{formatRp(item.qty * item.price)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL</span>
                <span>{formatRp(printData.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="uppercase">PAYMENT ({printData.method})</span>
                <span>{printData.method === 'cash' ? formatRp(printData.cashGiven) : formatRp(printData.total)}</span>
              </div>
              {printData.method === 'cash' && (
                <div className="flex justify-between">
                  <span>CHANGE</span>
                  <span>{formatRp(printData.change)}</span>
                </div>
              )}
            </div>

            <div className="mt-6 text-center text-xs">
              <p>Terima Kasih</p>
              <p>Silakan datang kembali</p>
            </div>
          </div>
          
          <div className="mt-4 flex gap-2 w-full pt-4 border-t hidden-print">
            <button onClick={() => setPrintData(null)} className="flex-1 bg-gray-200 py-2 rounded font-bold">Tutup</button>
            <button onClick={() => window.print()} className="flex-1 bg-blue-600 text-white py-2 rounded font-bold flex justify-center items-center gap-2"><Printer size={18}/> Cetak Struk</button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FFF8DC] text-[#8B5A2B] font-bold animate-pulse text-xl">Loading IQ Coffee...</div>;
  if (!role) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 font-sans flex flex-col">
      {/* Dynamic Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full text-white font-bold shadow-2xl z-50 flex items-center gap-2 transition-all duration-300 animate-bounce ${toast.type === 'danger' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.type === 'danger' ? <XCircle size={20}/> : <CheckCircle2 size={20}/>} {toast.msg}
        </div>
      )}

      {role === 'customer' ? (
        // CUSTOMER VIEW
        <div className="flex flex-col h-screen bg-[#FFF8DC]">
          <div className="bg-[#8B5A2B] text-white p-4 flex items-center gap-3 shadow-md">
            <button onClick={() => { setRole(null); setCart([]); }} className="p-2 bg-white/20 hover:bg-white/30 rounded-full"><ArrowLeft size={20}/></button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{settings.storeName}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${settings.isOpen ? 'bg-green-500' : 'bg-red-500'}`}>{settings.isOpen ? 'BUKA - Menerima Pesanan' : 'TUTUP'}</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <POSView />
          </div>
        </div>
      ) : (
        // ADMIN / OWNER VIEW
        <div className="flex flex-col h-screen">
          <TopNav />
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'pos' && <POSView />}
            {activeTab === 'products' && role === 'owner' && <ProductsTab />}
            {activeTab === 'inventory' && role === 'owner' && <InventoryTab />}
            {activeTab === 'reports' && role === 'owner' && <ReportsTab />}
            {activeTab === 'settings' && role === 'owner' && <SettingsTab />}
          </div>
          {(role === 'admin' || role === 'owner') && <OnlineOrdersTracker />}
        </div>
      )}

      <CheckoutModal />
      <PrintReceipt />
    </div>
  );
}