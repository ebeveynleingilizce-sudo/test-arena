export interface ArenaClass { classId: string; className: string; defaultGradeLevel: number }
export interface Student { studentId: string; teacherUid: string; classId: string; className: string; firstName: string; lastName: string; gradeLevel: number; status: 'active' | 'removed'; credentialVersion: number }
export interface StudentSession { teacherUid: string; studentId: string; credentialVersion: number }
