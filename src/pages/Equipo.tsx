import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface Employee {
  id: string;
  full_name: string | null;
  active: boolean;
  email?: string;
  role?: string;
  upload_count?: number;
}

export default function Equipo() {
  const { profile, session } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [open, setOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, active, company_id')
        .eq('company_id', profile.company_id);

      if (error) throw error;

      // Get upload counts
      const { data: uploads } = await supabase
        .from('file_uploads')
        .select('uploaded_by')
        .eq('company_id', profile.company_id);

      const uploadCounts: Record<string, number> = {};
      uploads?.forEach(u => {
        if (u.uploaded_by) {
          uploadCounts[u.uploaded_by] = (uploadCounts[u.uploaded_by] || 0) + 1;
        }
      });

      const employeeList: Employee[] = (profiles || []).map(p => ({
        id: p.id,
        full_name: p.full_name,
        active: p.active ?? true,
        upload_count: uploadCounts[p.id] || 0,
      }));

      setEmployees(employeeList);
    } catch (err) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const addEmployee = async () => {
    if (!newName || !newEmail || !session?.access_token) return;
    setCreating(true);
    setTempPassword(null);

    try {
      const { data, error } = await supabase.functions.invoke('create-employee', {
        body: { name: newName, email: newEmail },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTempPassword(data.employee.temp_password);
      toast.success(`Empleado ${newName} creado exitosamente`);
      await fetchEmployees();
      setNewName('');
      setNewEmail('');
    } catch (err: any) {
      toast.error('Error creando empleado: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (emp: Employee) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ active: !emp.active })
        .eq('id', emp.id);

      if (error) throw error;
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, active: !e.active } : e));
      toast.success(emp.active ? 'Empleado desactivado' : 'Empleado activado');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Equipo</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTempPassword(null); }}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> Agregar empleado</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
            {tempPassword ? (
              <div className="space-y-4 mt-4">
                <div className="bg-success/10 border border-success/20 rounded-lg p-4 space-y-2">
                  <p className="font-medium text-success">¡Empleado creado exitosamente!</p>
                  <p className="text-sm text-muted-foreground">Compartí estas credenciales con el empleado:</p>
                  <div className="space-y-1">
                    <p className="text-sm"><strong>Email:</strong> {newEmail || 'Ver tabla'}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm"><strong>Contraseña temporal:</strong> {tempPassword}</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(tempPassword)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                <Button onClick={() => { setOpen(false); setTempPassword(null); }} className="w-full" variant="outline">Cerrar</Button>
              </div>
            ) : (
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre completo" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@empresa.com" />
                </div>
                <p className="text-xs text-muted-foreground">Se generará una contraseña temporal que deberás compartir con el empleado.</p>
                <Button onClick={addEmployee} className="w-full" disabled={creating || !newName || !newEmail}>
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear empleado
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Empleados ({employees.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Cargas</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(emp => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.full_name || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`border-0 ${emp.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {emp.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{emp.upload_count || 0}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(emp)}>
                        {emp.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {employees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No hay empleados registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
