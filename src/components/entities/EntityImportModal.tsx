import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, X, AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface ValidationError {
  row: number;
  message: string;
  field?: string;
}

interface EntityImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  entityName: string;
  templateFileName: string;
  templateContent: string;
  columns: { key: string; label: string }[];
  validateRow: (row: Record<string, string>, rowIndex: number) => ValidationError[];
  importData: (data: Record<string, string>[]) => Promise<{ success: number; failed: number }> | { success: number; failed: number };
}

export function EntityImportModal({
  open,
  onOpenChange,
  onSuccess,
  entityName,
  templateFileName,
  templateContent,
  columns,
  validateRow,
  importData,
}: EntityImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setParsedData([]);
    setErrors([]);
    setIsImporting(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const validateData = (data: Record<string, string>[]): ValidationError[] => {
    const validationErrors: ValidationError[] = [];
    data.forEach((row, index) => {
      const rowErrors = validateRow(row, index);
      validationErrors.push(...rowErrors);
    });
    return validationErrors;
  };

  const parseFile = (selectedFile: File) => {
    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        setParsedData(data);
        const validationErrors = validateData(data);
        setErrors(validationErrors);
      },
      error: () => {
        setErrors([{ row: 0, message: 'Failed to parse CSV file' }]);
      },
    });
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setErrors([{ row: 0, message: 'Only CSV files are allowed' }]);
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setErrors([{ row: 0, message: 'File size must be 5MB or less' }]);
      return;
    }

    setFile(selectedFile);
    setErrors([]);
    parseFile(selectedFile);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = templateFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (errors.length > 0) return;

    setIsImporting(true);

    try {
      const result = await importData(parsedData);
      handleClose();
      onSuccess();
      return result;
    } finally {
      setIsImporting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getRowErrors = (rowIndex: number): ValidationError[] => {
    return errors.filter((e) => e.row === rowIndex + 2);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import {entityName}</DialogTitle>
        </DialogHeader>

        {!file ? (
          <div className="space-y-4">
            <div
              className={cn(
                'flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 transition-colors',
                dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 bg-muted/50'
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-1">Drag and drop CSV file here</p>
              <p className="text-xs text-muted-foreground mb-3">or</p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Browse file
              </Button>
              <p className="text-xs text-muted-foreground mt-3">Maximum file size: 5MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>

            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors[0].message}</AlertDescription>
              </Alert>
            )}

            <Button variant="link" className="text-primary p-0 h-auto" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" />
              Download Template
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} • {parsedData.length} rows detected
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={resetState}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {errors.length > 0 ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{errors.length} errors found</AlertTitle>
                <AlertDescription>Fix these rows before importing.</AlertDescription>
                <ScrollArea className="h-32 mt-2">
                  <ul className="text-sm space-y-1">
                    {errors.map((error, index) => (
                      <li key={index}>
                        Row {error.row}: {error.message}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </Alert>
            ) : (
              <Alert className="border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  All {parsedData.length} rows are valid and ready to import.
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-64 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {columns.map((col) => (
                      <TableHead key={col.key}>{col.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 10).map((row, index) => {
                    const rowErrors = getRowErrors(index);
                    const hasError = rowErrors.length > 0;

                    return (
                      <TableRow key={index} className={hasError ? 'border-l-2 border-l-destructive' : ''}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        {columns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={cn(rowErrors.some((e) => e.field === col.key) && 'bg-destructive/10')}
                          >
                            {row[col.key] || '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {parsedData.length > 10 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  ...and {parsedData.length - 10} more rows
                </p>
              )}
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!file || errors.length > 0 || isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              `Import ${entityName}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
