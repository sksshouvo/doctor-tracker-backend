type PatientLike = {
  _id: unknown;
  name: string;
  age: number;
  gender: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  bloodGroup?: string | null;
  diagnosis: string;
  condition: string;
  visitDate: Date;
  notes?: string | null;
  doctor: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

type PopulatedDoctor = { _id: unknown; name: string; specialization?: string };

export function toPatientDTO(p: PatientLike) {
  const d = p.doctor as PopulatedDoctor | null;
  const populated = d && typeof d === 'object' && 'name' in d;
  return {
    id: String(p._id),
    name: p.name,
    age: p.age,
    gender: p.gender,
    phone: p.phone,
    email: p.email ?? null,
    address: p.address ?? null,
    bloodGroup: p.bloodGroup ?? null,
    diagnosis: p.diagnosis,
    condition: p.condition,
    visitDate: p.visitDate,
    notes: p.notes ?? null,
    doctor: populated
      ? { id: String(d._id), name: d.name, specialization: d.specialization }
      : { id: String(p.doctor), name: null, specialization: null },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
