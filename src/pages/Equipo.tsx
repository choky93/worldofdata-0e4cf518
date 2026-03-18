import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Employee { id: string; name: string; email: string; active: boolean; uploads: number; lastActivity: string; }

const mockEmployees: Employee[] = [
  { id: '1', name: 'María López', email: 'maria@starimpresiones.com', active: true, uploads: 12, lastActivity: '2026-03-14' },
  { id: '2', name: 'Carlos Ruiz', email: 'carlos@starimpresiones.com', active: true, uploads: 5, lastActivity: '2026-03-10' },
  { id: '3', name: 'Ana Martínez', email: 'ana@starimpresiones.com', active: false, uploads: 0, lastActivity: '—' },
];

export default function Equipo() {
  const [employees, setEmployees] = useState(mockEmployees);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [open, setOpen] = useState(false);

  const addEmployee = () => {
    if (!newName || !newEmail) return;
    const emp: Employee = { id: `new-${Date.now()}`, name: newName, email: newEmail, active: true, uploads: 0, lastActivity: '—' };
    setEmployees(prev => [...prev, emp]);
    setNewName(''); setNewEmail(''); setOpen(false);
    toast.success(`Empleado ${newName} creado. Se enviará un email con las credenciales.`);
  };

  const toggleActive = (id: string) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, active: !e.active } : e));
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Equipo</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> Agregar empleado</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2"><Label>Nombre</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre completo" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@empresa.com" /></div>
              <p className="text-xs text-muted-foreground">Se generará una contraseña temporal y se enviará por email.</p>
              <Button onClick={addEmployee} className="w-full">Crear empleado</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Empleados ({employees.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nombre</TableHead><TableHead>Email</TableHead><TableHead>Estado</TableHead>
              <TableHead className="text-right">Cargas</TableHead><TableHead>Última actividad</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {employees.map(emp => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                  <TableCell>
                    <Badge className={`border-0 ${emp.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {emp.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{emp.uploads}</TableCell>
                  <TableCell className="tabular-nums">{emp.lastActivity}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(emp.id)}>
                      {emp.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
